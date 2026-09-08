// YamahaPulse Teltonika collector (FMB920, Codec 8 / 8E + Codec 12 commands)
// Zero dependencies — requires Node.js 18 or newer.
//
//   node server.js
//
// Env vars (optional):
//   COLLECTOR_PORT  TCP port to listen on (default 5027)
//   INGEST_URL      Where to forward parsed positions (defaults to your Supabase ingest function)

import net from "node:net";

const PORT = parseInt(process.env.COLLECTOR_PORT || "5027", 10);
const INGEST_URL =
  process.env.INGEST_URL ||
  "https://glwinxaanstczuubxqqg.supabase.co/functions/v1/ingest";

// Teltonika AVL IO IDs used by the FMB920 (see collector/README.md for the full map).
const IO = {
  DIN1: 1, // Digital Input 1 (ignition fallback)
  DIN2: 2, // Digital Input 2 (panic/SOS button)
  DIN3: 3, // Digital Input 3 (door sensor)
  IBUTTON: 24, // 8-byte 1-Wire driver key
  TEMP1: 70, // 1-Wire Temperature 1 (0.1 °C units)
  EXT_VOLTAGE: 66, // External voltage, mV
  DOUT1: 72, // Digital Output 1 (immobilizer relay)
  BATTERY: 113, // Backup battery level, %
  MOVEMENT: 240,
  ALARM: 236,
  IGNITION: 239,
  TOWING: 246,
  CRASH: 247,
  GREEN_TYPE: 248, // 1 = harsh accel, 2 = harsh brake, 3 = harsh corner
  GREEN_VALUE: 249, // G-force in mg
  JAMMING: 250,
  ODOMETER: 199, // Total odometer, meters
  GSM_SIGNAL: 21, // 0–5 bars
  GSM_OPERATOR: 241, // MCC*100+MNC, e.g. 63902 = Kenya/Safaricom
  GNSS_STATUS: 119,
  PDOP: 179, // x10
  HDOP: 180, // x10
  SLEEP_MODE: 200,
  BATT_CURRENT: 116, // mA
  BATT_VOLTAGE: 117, // mV
};

// Ingest returns a pending remote command; translate it to a GSM command for the device.
const ENGINE_COMMANDS = {
  ENGINE_CUT: "setdigout 1", // energize immobilizer relay on Output 1
  ENGINE_RESUME: "setdigout 0", // release immobilizer relay
};

// External power is considered present above ~6 V (vehicle installs run 12/24 V;
// below that the tracker is running on its backup battery).
const EXT_POWER_MV_THRESHOLD = 6000;

const log = (...args) => console.log("[collector]", ...args);

// Teltonika CRC-16 (polynomial 0xA001, init 0)
function crc16(buf) {
  let crc = 0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc & 0xffff;
}

class Reader {
  constructor(buf) {
    this.buf = buf;
    this.o = 0;
  }
  u8() {
    return this.buf.readUInt8(this.o++);
  }
  u16() {
    const v = this.buf.readUInt16BE(this.o);
    this.o += 2;
    return v;
  }
  i16() {
    const v = this.buf.readInt16BE(this.o);
    this.o += 2;
    return v;
  }
  u32() {
    const v = this.buf.readUInt32BE(this.o);
    this.o += 4;
    return v;
  }
  i32() {
    const v = this.buf.readInt32BE(this.o);
    this.o += 4;
    return v;
  }
  u64() {
    const v = this.buf.readBigUInt64BE(this.o);
    this.o += 8;
    return Number(v);
  }
  bytes(n) {
    const b = this.buf.subarray(this.o, this.o + n);
    this.o += n;
    return b;
  }
}

function parseRecord(r, codecId) {
  const is8E = codecId === 0x8e;

  const timestampMs = r.u64();
  r.u8(); // priority
  const lon = r.i32() / 1e7;
  const lat = r.i32() / 1e7;
  const altitude = r.i16();
  const angle = r.u16(); // degrees
  const satellites = r.u8();
  const speedKmh = r.u16();

  if (is8E) r.u16(); else r.u8(); // event IO id
  if (is8E) r.u16(); else r.u8(); // total IO count

  const io = new Map();
  const readSet = (valueBytes) => {
    const n = is8E ? r.u16() : r.u8();
    for (let i = 0; i < n; i++) {
      const id = is8E ? r.u16() : r.u8();
      let value;
      if (valueBytes === 1) value = r.u8();
      else if (valueBytes === 2) value = r.u16();
      else if (valueBytes === 4) value = r.u32();
      else value = r.u64();
      io.set(id, value);
    }
  };
  readSet(1);
  readSet(2);
  readSet(4);
  readSet(8);

  if (is8E) {
    // Variable-length IO elements
    const n = r.u16();
    for (let i = 0; i < n; i++) {
      r.u16(); // id
      const len = r.u16();
      r.bytes(len);
    }
  }

  const bool = (id) => (io.has(id) ? io.get(id) === 1 : null);
  const extVoltageMv = io.has(IO.EXT_VOLTAGE) ? io.get(IO.EXT_VOLTAGE) : null;
  const odometerM = io.has(IO.ODOMETER) ? io.get(IO.ODOMETER) : null;
  const tempRaw = io.has(IO.TEMP1) ? io.get(IO.TEMP1) : null; // 0.1 °C units
  const ibuttonRaw = io.has(IO.IBUTTON) ? io.get(IO.IBUTTON) : null;
  const greenType = io.has(IO.GREEN_TYPE) ? io.get(IO.GREEN_TYPE) : null;

  return {
    timestamp: new Date(timestampMs).toISOString(),
    lat,
    lon,
    altitude,
    angle,
    speedKmh,
    satellites,
    ignition: io.has(IO.IGNITION) ? io.get(IO.IGNITION) === 1 : bool(IO.DIN1),
    batteryLevel: io.has(IO.BATTERY) ? io.get(IO.BATTERY) : null,
    panic: bool(IO.DIN2),
    door: bool(IO.DIN3),
    movement: bool(IO.MOVEMENT),
    alarm: bool(IO.ALARM),
    towing: bool(IO.TOWING),
    crash: bool(IO.CRASH),
    jamming: bool(IO.JAMMING),
    harshAccel: greenType === 1,
    harshBrake: greenType === 2,
    harshCorner: greenType === 3,
    gforce: io.has(IO.GREEN_VALUE) ? Number((io.get(IO.GREEN_VALUE) / 1000).toFixed(2)) : null,
    externalPower: extVoltageMv !== null ? extVoltageMv >= EXT_POWER_MV_THRESHOLD : null,
    extVoltageMv,
    odometerKm: odometerM !== null ? Number((odometerM / 1000).toFixed(2)) : null,
    temperature: tempRaw !== null ? Number((tempRaw / 10).toFixed(1)) : null,
    ibutton:
      ibuttonRaw !== null && ibuttonRaw !== undefined
        ? ibuttonRaw.toString(16).padStart(16, "0")
        : null,
    gsmSignal: io.has(IO.GSM_SIGNAL) ? io.get(IO.GSM_SIGNAL) : null,
    gsmOperator: io.has(IO.GSM_OPERATOR) ? io.get(IO.GSM_OPERATOR) : null,
    gnssStatus: io.has(IO.GNSS_STATUS) ? io.get(IO.GNSS_STATUS) : null,
    pdop: io.has(IO.PDOP) ? Number((io.get(IO.PDOP) / 10).toFixed(1)) : null,
    hdop: io.has(IO.HDOP) ? Number((io.get(IO.HDOP) / 10).toFixed(1)) : null,
    sleepMode: io.has(IO.SLEEP_MODE) ? io.get(IO.SLEEP_MODE) : null,
    batteryCurrentMa: io.has(IO.BATT_CURRENT) ? io.get(IO.BATT_CURRENT) : null,
    batteryVoltageMv: io.has(IO.BATT_VOLTAGE) ? io.get(IO.BATT_VOLTAGE) : null,
  };
}

function parseAvlPacket(packet) {
  const r = new Reader(packet);
  if (r.u32() !== 0) throw new Error("bad preamble");
  const dataLen = r.u32();
  const dataStart = r.o;

  const codecId = r.u8();
  if (codecId !== 0x08 && codecId !== 0x8e) {
    throw new Error(`unsupported codec 0x${codecId.toString(16)}`);
  }

  const count1 = r.u8();
  const records = [];
  for (let i = 0; i < count1; i++) records.push(parseRecord(r, codecId));

  const count2 = r.u8();
  if (count1 !== count2) throw new Error("record count mismatch");

  const dataEnd = r.o;
  if (dataEnd - dataStart !== dataLen) throw new Error("data length mismatch");

  r.u16(); // CRC padding bytes
  const crc = r.u16();
  const expected = crc16(packet.subarray(dataStart, dataEnd));
  if (crc !== expected) throw new Error(`CRC mismatch (got ${crc}, want ${expected})`);

  return records;
}

// Codec 12 command packet, e.g. for `setdigout 1` (immobilizer relay control).
function codec12CommandPacket(cmd) {
  const body = Buffer.concat([
    Buffer.from([0x0c, 0x05, cmd.length]),
    Buffer.from(cmd, "ascii"),
    Buffer.from([0x01]), // number of commands
  ]);
  const packet = Buffer.alloc(8 + body.length + 4);
  packet.writeUInt32BE(0, 0); // preamble
  packet.writeUInt32BE(body.length, 4);
  body.copy(packet, 8);
  packet.writeUInt16BE(0, 8 + body.length); // CRC padding bytes
  packet.writeUInt16BE(crc16(body), 8 + body.length + 2);
  return packet;
}

async function forwardToIngest(imei, rec) {
  const payload = {
    imei,
    timestamp: rec.timestamp,
    lat: rec.lat,
    lon: rec.lon,
    speed_kmh: rec.speedKmh,
    course: rec.angle,
    alt: rec.altitude,
  };
  if (rec.ignition !== null) payload.ignition = rec.ignition;
  if (rec.batteryLevel !== null) payload.battery = rec.batteryLevel;
  if (rec.panic !== null) payload.panic = rec.panic;
  if (rec.door !== null) payload.door = rec.door;
  if (rec.movement !== null) payload.movement = rec.movement;
  if (rec.alarm !== null) payload.alarm = rec.alarm;
  if (rec.towing !== null) payload.towing = rec.towing;
  if (rec.crash !== null) payload.crash = rec.crash;
  if (rec.jamming !== null) payload.jamming = rec.jamming;
  if (rec.harshAccel) payload.harsh_accel = true;
  if (rec.harshBrake) payload.harsh_brake = true;
  if (rec.harshCorner) payload.harsh_corner = true;
  if (rec.gforce !== null) payload.gforce = rec.gforce;
  if (rec.externalPower !== null) payload.external_power = rec.externalPower;
  if (rec.odometerKm !== null) payload.odometer_km = rec.odometerKm;
  if (rec.temperature !== null) payload.temperature = rec.temperature;
  if (rec.ibutton) payload.ibutton = rec.ibutton;
  if (rec.satellites !== null) payload.satellites = rec.satellites;
  if (rec.gsmSignal !== null) payload.gsm_signal = rec.gsmSignal;
  if (rec.gsmOperator !== null) payload.gsm_operator = rec.gsmOperator;
  if (rec.gnssStatus !== null) payload.gnss_status = rec.gnssStatus;
  if (rec.pdop !== null) payload.pdop = rec.pdop;
  if (rec.hdop !== null) payload.hdop = rec.hdop;
  if (rec.sleepMode !== null) payload.sleep_mode = rec.sleepMode;
  if (rec.batteryCurrentMa !== null) payload.battery_current_ma = rec.batteryCurrentMa;
  if (rec.batteryVoltageMv !== null) payload.battery_voltage_mv = rec.batteryVoltageMv;
  if (rec.extVoltageMv !== null) payload.external_voltage_mv = rec.extVoltageMv;

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    log(`ingest rejected ${imei}: HTTP ${res.status} ${text}`);
    return null;
  }
  log(`imei=${imei} lat=${rec.lat} lon=${rec.lon} speed=${rec.speedKmh}km/h -> ok`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  let imei = null;
  let buffer = Buffer.alloc(0);

  log(`device connected from ${remote}`);
  socket.setTimeout(120_000, () => {
    log(`idle timeout, closing ${remote}`);
    socket.destroy();
  });

  socket.on("data", async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    try {
      // Step 1: IMEI handshake — tracker sends 2-byte length + ASCII IMEI
      if (!imei) {
        if (buffer.length < 2) return;
        const len = buffer.readUInt16BE(0);
        if (buffer.length < 2 + len) return;

        const candidate = buffer.subarray(2, 2 + len).toString("ascii");
        buffer = buffer.subarray(2 + len);

        if (/^\d{15,17}$/.test(candidate)) {
          imei = candidate;
          socket.write(Buffer.from([0x01])); // accept
          log(`IMEI accepted: ${imei}`);
        } else {
          log(`rejected handshake bytes from ${remote}`);
          socket.write(Buffer.from([0x00])); // reject
          socket.destroy();
        }
        return;
      }

      // Step 2: AVL data packets (may arrive split or batched)
      while (true) {
        if (buffer.length < 8) return;
        const codec = buffer[8];

        // Codec 12 response — the device replying to a command we sent earlier.
        if (codec === 0x0c) {
          const dataLen = buffer.readUInt32BE(4);
          const totalLen = 8 + dataLen + 4;
          if (buffer.length < totalLen) return;
          const body = buffer.subarray(8, 8 + dataLen);
          const textLen = body.length >= 3 ? body[2] : 0;
          const respText = body.subarray(3, 3 + textLen).toString("ascii").trim();
          log(`${imei}: codec12 response${respText ? `: ${respText}` : " (empty)"}`);
          buffer = buffer.subarray(totalLen);
          continue;
        }

        const dataLen = buffer.readUInt32BE(4);
        const totalLen = 8 + dataLen + 4;
        if (buffer.length < totalLen) return;

        const packet = buffer.subarray(0, totalLen);
        buffer = buffer.subarray(totalLen);

        const records = parseAvlPacket(packet);
        log(`${imei}: ${records.length} record(s) received`);

        // Acknowledge how many records we accepted
        const ack = Buffer.alloc(4);
        ack.writeUInt32BE(records.length, 0);
        socket.write(ack);

        for (const rec of records) {
          const result = await forwardToIngest(imei, rec);
          const command = result?.command;
          const gsmCommand = ENGINE_COMMANDS[command];
          if (gsmCommand) {
            socket.write(codec12CommandPacket(gsmCommand));
            log(`${imei}: relay command ${command} -> "${gsmCommand}"`);
          }
        }
      }
    } catch (err) {
      log(`error from ${imei ?? remote}:`, err instanceof Error ? err.message : err);
      socket.destroy();
    }
  });

  socket.on("error", () => {});
  socket.on("close", () => log(`connection closed (${imei ?? remote})`));
});

server.listen(PORT, () => {
  log(`listening for Teltonika devices on TCP port ${PORT}`);
  log(`forwarding to: ${INGEST_URL}`);
});

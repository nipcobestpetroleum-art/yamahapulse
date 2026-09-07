// YamahaPulse Teltonika collector (FMB920, Codec 8 / 8E)
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
  r.u8(); // satellites
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

  return {
    timestamp: new Date(timestampMs).toISOString(),
    lat,
    lon,
    altitude,
    angle,
    speedKmh,
    ignition: io.has(239) ? io.get(239) === 1 : null, // Teltonika IO 239 = ignition
    batteryLevel: io.has(113) ? io.get(113) : null, // IO 113 = battery level %
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

async function forwardToIngest(imei, rec) {
  const payload = {
    imei,
    timestamp: rec.timestamp,
    lat: rec.lat,
    lon: rec.lon,
    speed_kmh: rec.speedKmh,
    course: rec.angle,
    alt: rec.altitude,
    ignition: rec.ignition,
    battery: rec.batteryLevel,
  };

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    log(`ingest rejected ${imei}: HTTP ${res.status} ${text}`);
  } else {
    log(`imei=${imei} lat=${rec.lat} lon=${rec.lon} speed=${rec.speedKmh}km/h -> ok`);
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
          await forwardToIngest(imei, rec);
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
// Simulates a Teltonika FMB920 sending one Codec 8 position to the collector.
// Run the collector first (node server.js), then in another terminal:
//
//   node simulate.js                 -> uses IMEI 353691842796392
//   node simulate.js 123456789012345 -> any IMEI (must exist in your Devices list)
//
// Optional env:
//   COLLECTOR_HOST (default 127.0.0.1), COLLECTOR_PORT (default 5027)
//   SIM_IGNITION=1|0 ignition state — run with 1 to open an auto trip, then 0 to close it
//   SIM_PANIC=1      press the panic/SOS button (DIN2)
//   SIM_CRASH=1      report a crash event (IO 247)
//   SIM_POWER_CUT=1  external voltage drops to backup battery level

import net from "node:net";

const imei = process.argv[2] || "353691842796392";
const HOST = process.env.COLLECTOR_HOST || "127.0.0.1";
const PORT = parseInt(process.env.COLLECTOR_PORT || "5027", 10);

const IGNITION = process.env.SIM_IGNITION !== "0"; // default ON
const PANIC = process.env.SIM_PANIC === "1";
const CRASH = process.env.SIM_CRASH === "1";
const POWER_CUT = process.env.SIM_POWER_CUT === "1";

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

function buildRecord() {
  // 1-byte IOs: ignition (239), panic on DIN2, door on DIN3, battery % (113)
  const oneByte = [
    [239, IGNITION ? 1 : 0],
    [2, PANIC ? 1 : 0],
    [3, 0],
    [113, POWER_CUT ? 21 : 92],
  ];
  if (CRASH) oneByte.push([247, 1]);

  // 2-byte IOs: external voltage mV (66), 1-Wire temperature 0.1°C (70)
  const twoByte = [
    [66, POWER_CUT ? 3400 : 13850],
    [70, 255], // 25.5 °C
  ];

  // 4-byte IOs: total odometer in meters (199)
  const fourByte = [[199, 1543210]];

  const ioCount = oneByte.length + twoByte.length + fourByte.length;
  const size =
    24 + // timestamp(8) priority(1) lon(4) lat(4) alt(2) angle(2) sats(1) speed(2)
    2 + // event id + total IO count
    (1 + oneByte.length * 2) +
    (1 + twoByte.length * 3) +
    (1 + fourByte.length * 5) +
    1; // 8-byte IO count

  const b = Buffer.alloc(size);
  let o = 0;
  b.writeBigUInt64BE(BigInt(Date.now()), o); // timestamp ms
  o += 8;
  b.writeUInt8(0, o++); // priority
  b.writeInt32BE(Math.round(36.8219 * 1e7), o); // longitude (Nairobi)
  o += 4;
  b.writeInt32BE(Math.round(-1.2921 * 1e7), o); // latitude
  o += 4;
  b.writeInt16BE(1660, o); // altitude m
  o += 2;
  b.writeUInt16BE(90, o); // angle
  o += 2;
  b.writeUInt8(12, o++); // satellites
  b.writeUInt16BE(45, o); // speed km/h
  o += 2;
  b.writeUInt8(0, o++); // event IO id
  b.writeUInt8(ioCount, o++); // total IO count

  b.writeUInt8(oneByte.length, o++);
  for (const [id, v] of oneByte) {
    b.writeUInt8(id, o++);
    b.writeUInt8(v, o++);
  }
  b.writeUInt8(twoByte.length, o++);
  for (const [id, v] of twoByte) {
    b.writeUInt8(id, o++);
    b.writeUInt16BE(v, o);
    o += 2;
  }
  b.writeUInt8(fourByte.length, o++);
  for (const [id, v] of fourByte) {
    b.writeUInt8(id, o++);
    b.writeUInt32BE(v, o);
    o += 4;
  }
  b.writeUInt8(0, o++); // no 8-byte IO

  return b.subarray(0, o);
}

function buildPacket() {
  const record = buildRecord();
  const data = Buffer.concat([Buffer.from([0x08, 1]), record, Buffer.from([1])]); // codec 8, 1 record
  const packet = Buffer.alloc(8 + data.length + 4);
  packet.writeUInt32BE(0, 0); // preamble
  packet.writeUInt32BE(data.length, 4);
  data.copy(packet, 8);
  packet.writeUInt16BE(0, 8 + data.length); // CRC padding
  packet.writeUInt16BE(crc16(data), 8 + data.length + 2);
  return packet;
}

function codec12Response(text) {
  const body = Buffer.concat([
    Buffer.from([0x0c, 0x01, text.length]),
    Buffer.from(text, "ascii"),
    Buffer.from([0x01]),
  ]);
  const packet = Buffer.alloc(8 + body.length + 4);
  packet.writeUInt32BE(0, 0);
  packet.writeUInt32BE(body.length, 4);
  body.copy(packet, 8);
  packet.writeUInt16BE(0, 8 + body.length);
  packet.writeUInt16BE(crc16(body), 8 + body.length + 2);
  return packet;
}

const flags = [
  IGNITION ? "ignition-on" : "ignition-off",
  PANIC && "panic",
  CRASH && "crash",
  POWER_CUT && "power-cut",
].filter(Boolean);

const socket = net.connect(PORT, HOST, () => {
  console.log(`[simulate] connected to ${HOST}:${PORT}`);
  const imeiBuf = Buffer.from(imei, "ascii");
  const hello = Buffer.alloc(2 + imeiBuf.length);
  hello.writeUInt16BE(imeiBuf.length, 0);
  imeiBuf.copy(hello, 2);
  socket.write(hello);
});

socket.on("data", (data) => {
  if (data.length === 1) {
    if (data[0] === 1) {
      console.log("[simulate] IMEI accepted, sending AVL packet…");
      socket.write(buildPacket());
    } else {
      console.log("[simulate] IMEI rejected by collector");
      socket.destroy();
    }
    return;
  }
  if (data.length === 4) {
    console.log(`[simulate] collector ACK'd ${data.readUInt32BE(0)} record(s)`);
    // Stay open briefly in case the platform queues an engine command for this device.
    setTimeout(() => socket.destroy(), 2000);
    return;
  }
  // Codec 12 command from the collector (e.g. immobilizer) — reply like a real FMB920.
  console.log(`[simulate] codec12 command received (${data.length} bytes) — replying OK`);
  socket.write(codec12Response("OK"));
});

socket.on("close", () => {
  console.log(
    `[simulate] done${flags.length ? ` — flags: ${flags.join(", ")}` : ""} — check the collector logs, Events page and your alert inbox`,
  );
});

socket.on("error", (err) => console.error("[simulate] error:", err.message));

// Simulates a Teltonika FMB920 sending one Codec 8 position to the collector.
// Run the collector first (node server.js), then in another terminal:
//
//   node simulate.js                 -> uses IMEI 353691842796392
//   node simulate.js 123456789012345 -> any IMEI (must exist in your Devices list)
//
// Optional env: COLLECTOR_HOST (default 127.0.0.1), COLLECTOR_PORT (default 5027)

import net from "node:net";

const imei = process.argv[2] || "353691842796392";
const HOST = process.env.COLLECTOR_HOST || "127.0.0.1";
const PORT = parseInt(process.env.COLLECTOR_PORT || "5027", 10);

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
  const b = Buffer.alloc(31 + 7);
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
  b.writeUInt8(1, o++); // total IO count
  b.writeUInt8(1, o++); // one 1-byte IO
  b.writeUInt8(239, o++); // IO 239 = ignition
  b.writeUInt8(1, o++); // ignition ON
  b.writeUInt8(0, o++); // no 2-byte IO
  b.writeUInt8(0, o++); // no 4-byte IO
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
  console.log(`[simulate] collector ACK'd ${data.readUInt32BE(0)} record(s)`);
  console.log("[simulate] done — check the collector logs and your Live Tracking page");
  setTimeout(() => socket.destroy(), 500);
});

socket.on("error", (err) => console.error("[simulate] error:", err.message));
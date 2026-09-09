import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecordPayload,
  codec12CommandPacket,
  crc16,
  extractCommand,
  parseAvlPacket,
} from "../collector/server.js";

function buildPacket({ timestamp = Date.now(), ignition = true, panic = false } = {}) {
  const oneByte = [[239, ignition ? 1 : 0], [2, panic ? 1 : 0]];
  const record = Buffer.alloc(24 + 2 + 1 + oneByte.length * 2 + 1 + 1 + 1);
  let offset = 0;
  record.writeBigUInt64BE(BigInt(timestamp), offset); offset += 8;
  record.writeUInt8(0, offset++);
  record.writeInt32BE(Math.round(36.8219 * 1e7), offset); offset += 4;
  record.writeInt32BE(Math.round(-1.2921 * 1e7), offset); offset += 4;
  record.writeInt16BE(1660, offset); offset += 2;
  record.writeUInt16BE(90, offset); offset += 2;
  record.writeUInt8(10, offset++);
  record.writeUInt16BE(45, offset); offset += 2;
  record.writeUInt8(0, offset++);
  record.writeUInt8(oneByte.length, offset++);
  record.writeUInt8(oneByte.length, offset++);
  for (const [id, value] of oneByte) {
    record.writeUInt8(id, offset++);
    record.writeUInt8(value, offset++);
  }
  record.writeUInt8(0, offset++); // 2-byte IO count
  record.writeUInt8(0, offset++); // 4-byte IO count
  record.writeUInt8(0, offset++); // 8-byte IO count
  const body = Buffer.concat([Buffer.from([0x08, 1]), record.subarray(0, offset), Buffer.from([1])]);
  const packet = Buffer.alloc(8 + body.length + 4);
  packet.writeUInt32BE(0, 0);
  packet.writeUInt32BE(body.length, 4);
  body.copy(packet, 8);
  packet.writeUInt16BE(0, 8 + body.length);
  packet.writeUInt16BE(crc16(body), 8 + body.length + 2);
  return packet;
}

test("Codec 8 packet parses position and IO state", () => {
  const [record] = parseAvlPacket(buildPacket({ ignition: false, panic: true }));
  assert.equal(record.lat, -1.2921);
  assert.equal(record.lon, 36.8219);
  assert.equal(record.ignition, false);
  assert.equal(record.panic, true);
  assert.equal(record.speedKmh, 45);
});

test("CRC corruption is rejected", () => {
  const packet = buildPacket();
  packet[packet.length - 1] ^= 0xff;
  assert.throws(() => parseAvlPacket(packet), /CRC mismatch/);
});

test("wire mapping preserves nullable diagnostics and event flags", () => {
  const payload = buildRecordPayload({
    timestamp: "2026-01-01T00:00:00.000Z",
    lat: 1,
    lon: 2,
    speedKmh: 30,
    angle: 90,
    altitude: 10,
    ignition: true,
    batteryLevel: null,
    panic: true,
    door: null,
    movement: false,
    alarm: null,
    towing: null,
    crash: false,
    jamming: null,
    harshAccel: false,
    harshBrake: true,
    harshCorner: false,
    gforce: 1.2,
    externalPower: true,
    odometerKm: 12.3,
    temperature: 25.5,
    ibutton: null,
    satellites: 8,
    gsmSignal: 4,
    gsmOperator: null,
    gnssStatus: 3,
    pdop: 2.2,
    hdop: 1.4,
    sleepMode: 0,
    batteryCurrentMa: 10,
    batteryVoltageMv: 4100,
    extVoltageMv: 13800,
  });
  assert.equal(payload.panic, true);
  assert.equal(payload.harsh_brake, true);
  assert.equal(payload.ignition, true);
  assert.equal(payload.door, undefined);
  assert.equal(payload.odometer_km, 12.3);
});

test("Codec 12 command packet and response command extraction are stable", () => {
  const packet = codec12CommandPacket("setdigout 1");
  assert.equal(packet.readUInt32BE(0), 0);
  assert.equal(packet.readUInt8(8), 0x0c);
  assert.equal(extractCommand({ command: "ENGINE_CUT" }), "ENGINE_CUT");
  assert.equal(extractCommand({ results: [{ command: null }, { command: "ENGINE_RESUME" }] }), "ENGINE_RESUME");
  assert.equal(extractCommand({ results: [] }), null);
});

// The collector is imported with COLLECTOR_TEST=1 so this suite never opens a TCP listener.
assert.equal(process.env.COLLECTOR_TEST, "1");

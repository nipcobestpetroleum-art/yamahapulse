#!/usr/bin/env node

import net from "node:net";
import { performance } from "node:perf_hooks";

const TRACKERS = Number(process.env.TRACKERS || process.argv[2] || 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 100);
const HOST = process.env.TCP_LOAD_HOST || "";
const PORT = Number(process.env.TCP_LOAD_PORT || 5027);
const IMEI_PREFIX = process.env.IMEI_PREFIX || "990001";
const DRY_RUN = process.env.DRY_RUN !== "0";
const HOLD_MS = Number(process.env.HOLD_MS || 1000);
const RECONNECT_ROUNDS = Number(process.env.RECONNECT_ROUNDS || 1);
const TIMEOUT_MS = Number(process.env.TCP_TIMEOUT_MS || 10000);

if (!Number.isInteger(TRACKERS) || TRACKERS < 1 || TRACKERS > 100_000) {
  throw new Error("TRACKERS must be an integer from 1 to 100000");
}
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 1000) {
  throw new Error("CONCURRENCY must be an integer from 1 to 1000");
}
if (!Number.isInteger(RECONNECT_ROUNDS) || RECONNECT_ROUNDS < 1 || RECONNECT_ROUNDS > 20) {
  throw new Error("RECONNECT_ROUNDS must be an integer from 1 to 20");
}
if (!DRY_RUN && (!HOST || !Number.isInteger(PORT) || PORT < 1 || PORT > 65535)) {
  throw new Error("Set TCP_LOAD_HOST and a valid TCP_LOAD_PORT before a live run");
}

function imeiFor(index) {
  const width = 15 - IMEI_PREFIX.length;
  if (width < 1) throw new Error("IMEI_PREFIX must leave room for a numeric suffix");
  return `${IMEI_PREFIX}${String(index % 10 ** width).padStart(width, "0")}`;
}

function crc16(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc & 0xffff;
}

function buildPacket(index, round) {
  const record = Buffer.alloc(40);
  let offset = 0;
  record.writeBigUInt64BE(BigInt(Date.now() + round * 1000), offset); offset += 8;
  record.writeUInt8(0, offset++);
  record.writeInt32BE(Math.round((6.5244 + (index % 100) * 0.0001) * 1e7), offset); offset += 4;
  record.writeInt32BE(Math.round((3.3792 + (round % 100) * 0.0001) * 1e7), offset); offset += 4;
  record.writeInt16BE(100, offset); offset += 2;
  record.writeUInt16BE(90, offset); offset += 2;
  record.writeUInt8(10, offset++);
  record.writeUInt16BE(35, offset); offset += 2;
  record.writeUInt8(239, offset++); // event IO id
  record.writeUInt8(1, offset++); // total IO count
  record.writeUInt8(1, offset++); // one-byte IO count
  record.writeUInt8(239, offset++);
  record.writeUInt8(round % 2 === 0 ? 1 : 0, offset++);
  record.writeUInt8(0, offset++); // two-byte IO count
  record.writeUInt8(0, offset++); // four-byte IO count
  record.writeUInt8(0, offset++); // eight-byte IO count

  const data = Buffer.concat([Buffer.from([0x08, 1]), record.subarray(0, offset), Buffer.from([1])]);
  const packet = Buffer.alloc(8 + data.length + 4);
  packet.writeUInt32BE(0, 0);
  packet.writeUInt32BE(data.length, 4);
  data.copy(packet, 8);
  packet.writeUInt16BE(0, 8 + data.length);
  packet.writeUInt16BE(crc16(data), 8 + data.length + 2);
  return packet;
}

function runSession(index, round) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    const started = performance.now();
    let stage = "handshake";
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (ok, error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, latencyMs: performance.now() - started, error });
    };

    const timer = setTimeout(() => finish(false, "timeout"), TIMEOUT_MS);
    timer.unref();

    socket.on("connect", () => {
      const imei = Buffer.from(imeiFor(index), "ascii");
      const hello = Buffer.alloc(2 + imei.length);
      hello.writeUInt16BE(imei.length, 0);
      imei.copy(hello, 2);
      socket.write(hello);
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === "handshake" && buffer.length >= 1) {
        if (buffer[0] !== 1) {
          clearTimeout(timer);
          finish(false, "handshake-rejected");
          return;
        }
        stage = "ack";
        buffer = buffer.subarray(1);
        socket.write(buildPacket(index, round));
      }
      if (stage === "ack" && buffer.length >= 4) {
        clearTimeout(timer);
        const count = buffer.readUInt32BE(0);
        if (count !== 1) finish(false, `unexpected-ack-${count}`);
        else setTimeout(() => finish(true), HOLD_MS).unref();
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      finish(false, error.code || error.message);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      if (!settled) finish(false, "closed-before-ack");
    });
  });
}

async function run() {
  const totalSessions = TRACKERS * RECONNECT_ROUNDS;
  if (DRY_RUN) {
    console.log(JSON.stringify({
      mode: "dry-run",
      host: HOST || "not set",
      port: PORT,
      trackers: TRACKERS,
      reconnect_rounds: RECONNECT_ROUNDS,
      total_tcp_sessions: totalSessions,
      concurrency: CONCURRENCY,
      hold_ms: HOLD_MS,
    }, null, 2));
    return;
  }

  const started = performance.now();
  const results = [];
  for (let offset = 0; offset < TRACKERS; offset += CONCURRENCY) {
    const indexes = Array.from({ length: Math.min(CONCURRENCY, TRACKERS - offset) }, (_, i) => offset + i);
    for (let round = 0; round < RECONNECT_ROUNDS; round += 1) {
      results.push(...await Promise.all(indexes.map((index) => runSession(index, round))));
    }
  }

  const latencies = results.filter((r) => r.ok).map((r) => r.latencyMs).sort((a, b) => a - b);
  const percentile = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))].toFixed(1) : "0.0";
  const failures = results.filter((r) => !r.ok);
  console.log(JSON.stringify({
    mode: "live",
    trackers: TRACKERS,
    reconnect_rounds: RECONNECT_ROUNDS,
    total_tcp_sessions: results.length,
    successful_sessions: results.length - failures.length,
    failed_sessions: failures.length,
    elapsed_seconds: ((performance.now() - started) / 1000).toFixed(2),
    session_p50_ms: percentile(0.5),
    session_p95_ms: percentile(0.95),
    session_p99_ms: percentile(0.99),
    failure_reasons: Object.fromEntries(failures.reduce((map, item) => map.set(item.error, (map.get(item.error) || 0) + 1), new Map())),
  }, null, 2));
}

run().catch((error) => {
  console.error(`[tcp-load-harness] ${error.message}`);
  process.exitCode = 1;
});

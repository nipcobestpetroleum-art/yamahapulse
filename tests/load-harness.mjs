#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const TRACKERS = Number(process.env.TRACKERS || process.argv[2] || 1000);
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS || 30);
const INTERVAL_SECONDS = Number(process.env.INTERVAL_SECONDS || 60);
const CONCURRENCY = Number(process.env.CONCURRENCY || 100);
const TARGET_URL = process.env.LOAD_TARGET_URL || "";
const IMEI_PREFIX = process.env.IMEI_PREFIX || "990000";
const DRY_RUN = process.env.DRY_RUN !== "0";
const BATCH_SIZE = Math.max(1, Math.min(100, Number(process.env.BATCH_SIZE || 25)));

if (!Number.isInteger(TRACKERS) || TRACKERS < 1 || TRACKERS > 100_000) {
  throw new Error("TRACKERS must be an integer from 1 to 100000");
}
if (!Number.isFinite(DURATION_SECONDS) || DURATION_SECONDS < 1) throw new Error("DURATION_SECONDS must be >= 1");
if (!Number.isFinite(INTERVAL_SECONDS) || INTERVAL_SECONDS <= 0) throw new Error("INTERVAL_SECONDS must be > 0");
if (!DRY_RUN && !TARGET_URL) throw new Error("Set LOAD_TARGET_URL before running a live load test");

const totals = { attempted: 0, succeeded: 0, failed: 0, status: new Map(), latencies: [] };
const started = performance.now();

function imeiFor(index) {
  return `${IMEI_PREFIX}${String(index).padStart(15 - IMEI_PREFIX.length, "0")}`;
}

function makeRecord(index, sequence) {
  return {
    timestamp: new Date(Date.now() + sequence * 1000).toISOString(),
    lat: 6.5244 + ((index % 100) * 0.0001),
    lon: 3.3792 + ((sequence % 100) * 0.0001),
    speed_kmh: sequence % 5 === 0 ? 0 : 35,
    ignition: sequence % 5 !== 0,
    movement: sequence % 5 !== 0,
    satellites: 10,
    battery: 88,
  };
}

async function post(imei, records) {
  const begin = performance.now();
  totals.attempted += records.length;
  if (DRY_RUN) {
    totals.succeeded += records.length;
    totals.latencies.push(performance.now() - begin);
    return;
  }
  const response = await fetch(TARGET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imei, records }),
  });
  const key = String(response.status);
  totals.status.set(key, (totals.status.get(key) || 0) + 1);
  if (!response.ok) {
    totals.failed += records.length;
    throw new Error(`HTTP ${response.status}`);
  }
  totals.succeeded += records.length;
  totals.latencies.push(performance.now() - begin);
}

async function run() {
  const batches = [];
  for (let index = 0; index < TRACKERS; index += 1) {
    const records = [];
    for (let sequence = 0; sequence < BATCH_SIZE; sequence += 1) records.push(makeRecord(index, sequence));
    batches.push({ imei: imeiFor(index), records });
  }

  if (DRY_RUN) {
    console.log(JSON.stringify({ mode: "dry-run", trackers: TRACKERS, batches: batches.length, records: TRACKERS * BATCH_SIZE, duration_seconds: DURATION_SECONDS, interval_seconds: INTERVAL_SECONDS }, null, 2));
    return;
  }

  for (let offset = 0; offset < batches.length; offset += CONCURRENCY) {
    await Promise.all(batches.slice(offset, offset + CONCURRENCY).map((batch) => post(batch.imei, batch.records).catch(() => undefined)));
  }

  const elapsed = (performance.now() - started) / 1000;
  const sorted = [...totals.latencies].sort((a, b) => a - b);
  const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1) : "0.0";
  console.log(JSON.stringify({
    mode: "live",
    trackers: TRACKERS,
    attempted_records: totals.attempted,
    succeeded_records: totals.succeeded,
    failed_records: totals.failed,
    elapsed_seconds: elapsed.toFixed(2),
    records_per_second: (totals.succeeded / Math.max(elapsed, 0.001)).toFixed(1),
    request_p50_ms: percentile(0.50),
    request_p95_ms: percentile(0.95),
    request_p99_ms: percentile(0.99),
    http_statuses: Object.fromEntries(totals.status),
  }, null, 2));
}

run().catch((error) => {
  console.error(`[load-harness] ${error.message}`);
  process.exitCode = 1;
});

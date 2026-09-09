import test from "node:test";
import assert from "node:assert/strict";

function createModel() {
  return { latest: null, positions: [], events: [], trips: [], alerts: [] };
}

function ingest(model, record) {
  if (model.latest && record.recorded_at <= model.latest.recorded_at) {
    return { ok: true, deduped: true };
  }
  if (model.latest && record.recorded_at - model.latest.recorded_at < 1000) {
    return { ok: true, throttled: true };
  }
  const previous = model.latest;
  model.positions.push(record);
  model.latest = record;
  if (previous?.movement === true && record.movement === false) model.events.push("STOPPED");
  if (previous?.ignition === false && record.ignition === true) {
    model.events.push("IGNITION_ON");
    model.trips.push({ status: "IN_PROGRESS", start: record.recorded_at });
  }
  if (previous?.ignition === true && record.ignition === false) {
    model.events.push("IGNITION_OFF");
    const trip = model.trips.find((item) => item.status === "IN_PROGRESS");
    if (trip) {
      trip.status = "COMPLETED";
      trip.end = record.recorded_at;
    }
  }
  if (record.panic === true) {
    model.events.push("PANIC");
    model.alerts.push({ type: "PANIC", status: "OPEN" });
  }
  return { ok: true };
}

function ingestBatch(model, records) {
  return records.map((record) => ingest(model, record));
}

const record = (second, overrides = {}) => ({
  recorded_at: second * 1000,
  latitude: 6.52,
  longitude: 3.37,
  ignition: false,
  movement: false,
  ...overrides,
});

test("new records update latest and history", () => {
  const model = createModel();
  ingest(model, record(1));
  ingest(model, record(2, { latitude: 6.53 }));
  assert.equal(model.positions.length, 2);
  assert.equal(model.latest.latitude, 6.53);
});

test("replays and sub-second floods do not create history rows", () => {
  const model = createModel();
  ingest(model, record(10));
  assert.equal(ingest(model, record(10)).deduped, true);
  assert.equal(ingest(model, record(10.5)).throttled, true);
  assert.equal(model.positions.length, 1);
});

test("batch processing preserves ignition state machine order", () => {
  const model = createModel();
  ingestBatch(model, [
    record(20, { ignition: false, movement: false }),
    record(21, { ignition: true, movement: true }),
    record(22, { ignition: true, movement: false, panic: true }),
    record(23, { ignition: false, movement: false }),
  ]);
  assert.deepEqual(model.events, ["IGNITION_ON", "STOPPED", "PANIC", "IGNITION_OFF"]);
  assert.equal(model.trips[0].status, "COMPLETED");
  assert.equal(model.alerts.length, 1);
});

test("out-of-order records cannot roll back latest state", () => {
  const model = createModel();
  ingest(model, record(30, { latitude: 1 }));
  ingest(model, record(29, { latitude: 99 }));
  assert.equal(model.latest.latitude, 1);
  assert.equal(model.positions.length, 1);
});

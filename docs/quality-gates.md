# Phase D — Quality Gates and Scale Validation

## Local verification

```text
npm test
npm run lint
npm run build
npm run load:dry -- 1000
```

`npm test` runs:

- `tests/collector-protocol.test.mjs`: Codec 8 parsing, CRC rejection, IO-to-ingest mapping, Codec 12 command framing.
- `tests/ingest-regression.test.mjs`: deterministic replay protection, sub-second throttling, ordered batch state transitions, trip lifecycle, panic alerts, and out-of-order protection.

## Load harness

`tests/load-harness.mjs` is safe by default: it performs no network calls and prints the planned workload.

```text
npm run load:dry -- 1000
TRACKERS=10000 BATCH_SIZE=25 npm run load:dry
TRACKERS=100000 BATCH_SIZE=25 npm run load:dry
```

A live run requires both an explicit target and `DRY_RUN=0`:

```text
LOAD_TARGET_URL=https://staging.example/functions/v1/ingest \
DRY_RUN=0 TRACKERS=1000 BATCH_SIZE=25 CONCURRENCY=100 \
npm run load
```

The live harness reports accepted/failed records, HTTP status counts, throughput,
and p50/p95/p99 request latency. Run live tests only against a staging project
with disposable IMEIs and an explicit maintenance window. Do not point it at
production without capacity approval and a cleanup plan.

## Recommended progression

1. Dry-run 1k, 10k, and 100k to validate workload generation.
2. Run 1k live against staging and inspect RPC latency, database CPU, locks,
   partition pruning, and pipeline health.
3. Run 10k live with a reconnect burst profile and monitor retry depth.
4. Run 100k only in an isolated capacity environment; the current harness is
   HTTP-level and does not create 100k real TCP sessions.
5. Use the results to decide whether the collector's in-memory retry buffer
   must be replaced with a durable queue before launch.

## CI gate recommendation

CI should run `npm test`, `npm run lint`, `npm run build`, and type checks on every
pull request. Database RPC integration tests must run against a disposable
staging Supabase project, never a developer's or production database.

## Database query-plan review

The current hot-path plans were reviewed after adding these targeted indexes:

- `latest_positions_org_updated_idx` — organization freshness checks
- `gps_devices_org_status_seen_idx` — stale in-use device checks
- `alert_rules_enabled_type_org_idx` — enabled rule lookups by organization/type
- `trips_vehicle_status_idx` — open-trip lookups
- `maintenance_schedules_vehicle_status_service_idx` — per-telemetry schedule checks
- `maintenance_intervals_org_vehicle_active_idx` — active interval checks

The partitioned telemetry plans already use child indexes and partition-aware
Append scans. At the current 40-device/9.5k-row scale PostgreSQL correctly
chooses sequential scans for some small tables despite the indexes; that is
expected. Re-run `EXPLAIN (ANALYZE, BUFFERS)` in staging at 10k and 100k device
sizes before removing or adding indexes.

A data-quality exception was found in `positions_default`: one position has a
2004 timestamp and zero coordinates while its server `created_at` is current.
Do not delete it blindly; investigate the device (`353691843428060`) and add a
clock/GPS-quality remediation before production rollout. The default partition
is intentionally retained so malformed device timestamps cannot break ingest.

## Current limitations

- The ingest regression suite is deterministic and does not mutate Supabase.
- The load harness uses HTTP batch requests; it does not model TCP connection
  count, cellular reconnect behavior, or Railway autoscaling.
- A true 100k reconnect-storm test requires an isolated staging environment with
  production-like database sizing and a durable queue decision.

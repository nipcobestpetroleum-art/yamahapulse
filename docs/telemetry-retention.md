# Telemetry Partitioning & Retention Policy

`positions` and `device_events` are **declaratively partitioned by month** on their
timestamp column (`positions.recorded_at`, `device_events.created_at`). Each month
gets one partition (e.g. `positions_202609`), plus a `*_default` safety-net
partition that catches rows with out-of-range timestamps (device clock drift) so
ingestion never fails.

## Why

At fleet scale the telemetry tables are append-only and grow without bound
(100k devices at 60s pings ≈ 144M rows/day). Partitioning turns retention into a
cheap metadata operation — dropping an expired month is one `DROP TABLE` instead
of a massive per-row `DELETE` — and keeps per-device/per-time-range queries
scanning only relevant partitions.

## Retention defaults

| Table | Retention | Rationale |
|---|---|---|
| `positions` | **180 days** | Raw breadcrumbs; trips/odometer keep long-term distance history |
| `device_events` | **730 days** | Events (harsh driving, crashes, geofences) are small and needed for reports/audits |

To change a window, update the defaults in `public.maintain_telemetry_partitions`
or pass explicit values to the cron command. `latest_positions` is never expired
(one row per device, always current).

## Maintenance job

`public.maintain_telemetry_partitions(p_retention_positions_days, p_retention_events_days, p_dry_run)`:

1. Pre-creates the **current and next month's** partitions (with grants) so
   inserts never hit a missing-partition error.
2. Drops monthly partitions whose **end boundary** is older than the retention
   window.

Scheduled daily at **03:30 UTC** via pg_cron (job name
`telemetry-partition-maintenance`, job id visible in `cron.job`).

Only `service_role`/cron may execute it (revoked from `public`/`anon`/`authenticated`).

## Operational commands

```sql
-- Preview what the job would do right now
select * from public.maintain_telemetry_partitions(p_dry_run => true);

-- Run immediately with custom windows
select * from public.maintain_telemetry_partitions(
  p_retention_positions_days => 90,
  p_retention_events_days   => 365
);

-- Inspect partitions and sizes
select c.relname, pg_size_pretty(pg_total_relation_size(c.oid))
from pg_inherits i
join pg_class p on p.oid = i.inhparent
join pg_class c on c.oid = i.inhrelid
where p.relname = 'positions';

-- Check last cron runs
select * from cron.job_run_details order by start_time desc limit 10;
```

## Notes

- Dropping a partition is **permanent** for that month's raw data. Long-term
  analytics should rely on rollup tables (trips, odometer, alerts) rather than
  raw positions, or export partitions to cold storage before expiry.
- Rows in `*_default` (clock drift) are never auto-dropped; investigate devices
  landing there (`select count(*) from positions_default;`).

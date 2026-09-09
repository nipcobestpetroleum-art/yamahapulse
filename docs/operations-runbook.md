# YamahaPulse Operations Runbook

## Scope and targets

| Service | Target | Detection |
|---|---:|---|
| Telemetry ingestion | 99.9% monthly | System Health page; `pipeline_health` snapshots every 5 minutes |
| Live position freshness | < 2 minutes when a tracker is connected | `latest_positions.updated_at` |
| Recovery point objective | Depends on Supabase plan; verify current plan contract | Supabase backup/PITR settings |
| Recovery time objective | Define per customer tier before launch | Restore drill and collector redeploy drill |

## Daily operational checks

1. Open **Administration → System Health** for each production organization.
2. Confirm the latest snapshot is less than 10 minutes old.
3. Review `NO_DATA_15M` and `HIGH_STALE` issues.
4. Check failed scheduled jobs:

```sql
select jobid, jobname, status, start_time, end_time, return_message
from cron.job_run_details
where start_time > now() - interval '24 hours'
  and status <> 'succeeded'
order by start_time desc;
```

5. Confirm partitions exist for the current and next UTC month:

```sql
select c.relname
from pg_inherits i
join pg_class p on p.oid = i.inhparent
join pg_class c on c.oid = i.inhrelid
where p.relname in ('positions', 'device_events')
order by c.relname;
```

## Device fleet is silent

1. Check **System Health**:
   - `NO_DATA_15M` across the organization indicates collector, ingest, or network failure.
   - `HIGH_STALE` indicates a partial fleet/device/SIM/power issue.
2. Check the Railway collector service health, deployment logs, TCP listener, and outbound HTTPS connectivity.
3. Verify the collector's `INGEST_URL` is correct.
4. If the shared secret is enabled, verify `COLLECTOR_KEY` exactly matches the ingest function's `COLLECTOR_SECRET`. Never log either secret.
5. Check recent edge-function and network logs for 401, 429, 500, timeout, or Supabase errors.
6. Confirm the IMEI exists in `gps_devices` and has the expected organization/assignment.
7. Restart or redeploy the collector only after capturing logs and confirming the cause. Teltonika devices should resend unacknowledged records; the ingest RPC rejects replayed timestamps safely.

## Only some devices are stale

1. Inspect the device's `last_seen_at`, SIM status, assignment, and latest position.
2. Check vehicle power, tracker LEDs, cellular coverage, and SIM/data balance with the carrier.
3. Confirm the tracker clock is sane; records with timestamps older than the latest snapshot are intentionally deduplicated.
4. Use the device connectivity test from Device Management, then send a controlled test ping if permitted.
5. Do not delete historical positions to fix a stale device; resolve the hardware/network issue.

## Ingest errors and replay safety

- `401 Unauthorized collector`: shared secret mismatch or missing header.
- `404 Unknown device`: register the IMEI before connecting the tracker.
- `400 invalid coordinates`: inspect tracker GPS fix and vendor mapping.
- `500 Failed to process telemetry`: inspect the ingest edge-function and database logs.
- `deduped: true`: the record timestamp is not newer than the device's latest accepted position; this is expected for retries/out-of-order packets.
- `throttled: true`: sub-second record gap; inspect tracker configuration if frequent.

## Partition maintenance and retention

The daily pg_cron job `telemetry-partition-maintenance` creates current/next month partitions and removes expired monthly partitions. Defaults are 180 days for positions and 730 days for events.

```sql
select * from public.maintain_telemetry_partitions(p_dry_run => true);
select * from public.maintain_telemetry_partitions();
```

If a partition is missing, run the maintenance function and inspect `cron.job_run_details`. The `*_default` partition is a safety net for device clock drift; investigate non-zero counts instead of treating it as normal storage.

## Backup and disaster recovery verification

Supabase backup availability and PITR depend on the current project plan and are not exposed through the application database SQL surface.

**Before production launch:**

1. Record the Supabase plan, backup frequency, PITR window, retention, and support escalation path.
2. Confirm database backups are enabled in Supabase **Project Settings → Database → Backups**.
3. For a restore drill, restore a recent backup/PITR point into a separate staging project — never overwrite production.
4. Validate row counts and constraints for `organizations`, `gps_devices`, `latest_positions`, `positions` partitions, `alerts`, `trips`, and `pipeline_health`.
5. Verify RLS policies and grants after restore.
6. Start a staging collector and send a test tracker packet through the restored environment.
7. Record measured restore time (RTO) and data loss interval (RPO) in the release log.
8. Repeat at least quarterly and after major schema changes.

The `pipeline_health` table is a database-write canary: if snapshots stop advancing, investigate cron/database health before assuming trackers are offline.

## Alert handling

Pipeline alerts are organization-scoped `PIPELINE` alerts with no device association. They are deduplicated to one open alert per organization within six hours. Acknowledge/resolve them through the normal Alerts workflow after confirming recovery and documenting the cause.

## Escalation

- **L1 — Fleet operations:** validate System Health, device status, SIM/power, and collector dashboard.
- **L2 — Platform operations:** inspect Railway, Supabase Edge Functions, cron runs, RLS/grants, and partition maintenance.
- **L3 — Engineering/vendor:** investigate protocol parsing, database performance, carrier outage, or Supabase incident.

Record incident start/end, affected organizations/devices, user impact, root cause, mitigation, and follow-up action. Do not include IMEI lists, access tokens, or secrets in public incident notes.

## Security reminders

- Never place the service-role key, collector secret, or Resend key in browser code or logs.
- Use the Preview panel's Clear Cache only when diagnosing repeated auth/session issues; it signs the current preview out.
- Keep RLS enabled on every public table and test tenant isolation after schema changes.
- Rotate shared secrets during planned maintenance, then verify collector connectivity from a controlled device before broad rollout.
EOF
# Telemetry Ingest Architecture

## Write path

```
FMB920 tracker ──TCP──> collector (Node, Codec 8/8E)
                          │  ONE HTTPS POST per AVL packet (batched records,
                          │  in-memory retry buffer on failure)
                          ▼
                 Supabase Edge Function `ingest`
                          │  ONE PostgREST RPC call (single or batch)
                          ▼
                 public.ingest_position[_batch]  [plpgsql, SECURITY DEFINER]
```

### Batching & resilience

- The collector sends a whole AVL packet (all records after a reconnect, often
  dozens) as **one** `POST { imei, records: [...] }` → one
  `ingest_position_batch` call. Records are processed strictly in order inside
  the RPC, so per-device state machines (ignition/trips, debounces,
  transitions) see a consistent history even within a batch.
- If ingest is unreachable, the collector buffers batches in memory (max 10,000
  batches), retrying every 15 s with per-record error isolation; per-device
  ordering is preserved by queueing new batches behind pending retries for the
  same IMEI. After 5 failed attempts a batch is dropped and logged.
- Single-record mode (`ingest_position`) remains for live one-off pings,
  connectivity tests (`?test=1`), and third-party integrations.

The edge function keeps only what must live at the edge: payload parsing
(multi-vendor key aliases, NMEA coordinates, knot/kmh speed normalization,
timestamp normalization), coordinate validation, and critical-alert email
dispatch via Resend (HTTP is not reachable from the database).

**All database work happens inside `public.ingest_position`** — a single
server-side call that:

1. Resolves the device by IMEI (connectivity-test mode returns early, no writes)
2. Resolves the current vehicle assignment
3. Reads the previous `latest_positions` snapshot
4. Inserts the history row into `positions` (monthly partitions)
5. Derives idle state (debounced against org IDLE rule)
6. Derives low-battery state (debounced, +5% hysteresis)
7. Upserts `latest_positions`
8. Updates the device heartbeat
9. Builds behaviour/transition events (harsh driving, panic, crash, towing,
   jamming, door/ignition/movement/GPS/power transitions, idle, low battery)
10. Runs geofence containment (circles, `center = [lat, lng]`), updates
    `geofence_states`, emits enter/exit events
11. Applies overspeed rules (zone rules beat the org-wide limit)
12. Persists `device_events`; critical types also insert into `alerts`
13. Updates vehicle odometer (device-reported or haversine-derived, jumps ≥ 5 km
    ignored) and engine hours
14. Marks maintenance schedules `OVERDUE`; auto-generates schedules from intervals
15. Auto-detects trips from ignition transitions (closes stale/marathon >24 h trips)
16. Resolves iButton driver identification
17. Records 1-Wire/BLE temperature/humidity sensor readings
18. Delivers a pending engine-cut/resume command (returned to the collector)

Returns JSON: `{ ok, device_id, organization_id, vehicle_id, recorded_at,
command, latitude, longitude, critical_events[] }` — `critical_events` is the
email payload for the edge function.

## Why

The previous implementation issued 15–30 sequential PostgREST round trips per
ping. At fleet scale (~1–3k pings/s) that latency dominates everything. The RPC
executes the same logic server-side with index-only lookups, reducing the edge
function to one request + (rarely) email dispatch.

## Security

- `SECURITY DEFINER`, owned by `postgres` (bypasses RLS, like the previous
  service-role path)
- `EXECUTE` revoked from `public`/`anon`/`authenticated` — only `service_role`
  (the edge function) may call it. Otherwise any authenticated user could forge
  telemetry.
- The `anon` role holds **zero** privileges on public tables (revoked as
  defense-in-depth; RLS already gated every policy to org membership).

## Testing

```sql
-- Full behavioral test against a registered test device:
select public.ingest_position(p_imei := '<imei>', p_latitude := 6.5244,
  p_longitude := 3.3792, p_speed_kmh := 42, p_ignition := true, p_movement := true);

-- Connectivity test (no writes):
select public.ingest_position(p_imei := '<imei>', p_latitude := 1, p_longitude := 1, p_test := true);
```

Note: `CREATE OR REPLACE` on the function resets grants to the default —
re-apply the `REVOKE`/`GRANT` after any replacement.

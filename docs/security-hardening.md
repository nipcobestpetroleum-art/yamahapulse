# Security Hardening (Phase B)

## Implemented in code/database

### Ingest endpoint
- **Optional shared secret:** set `COLLECTOR_SECRET` in the ingest function's env
  (Supabase → Edge Functions → ingest → Secrets) and `COLLECTOR_KEY` on the
  collector; requests without a matching `x-collector-key` header are rejected
  with 401. Leave unset to keep the endpoint open for third-party trackers.
- **Batch cap:** at most 100 records per batch request (excess truncated + logged).
- **Replay protection:** the ingest RPC rejects any record at or before the
  device's newest stored `recorded_at` (`deduped: true`). Retried batches after
  a lost response are therefore idempotent — no double positions, trips or odometer.
- **Flood protection:** sub-second gaps between records for the same device are
  dropped (`throttled: true`).

### Database
- `anon` role holds zero privileges on public tables (defense-in-depth under RLS).
- Ingest RPCs (`ingest_position`, `ingest_position_batch`) executable only by
  `service_role`.

### Realtime
- `latest_positions` and `alerts` are in the `supabase_realtime` publication;
  subscriptions use `postgres_changes` with org filters — rows delivered are
  enforced by RLS. The app never uses broadcast/presence, so no cross-tenant
  channel data path exists. (If broadcast is ever added, enable Realtime
  Authorization and mark channels private.)

### Account security (app)
- TOTP two-factor: enrollment + management in **Profile → Two-factor
  authentication**; challenge gate at sign-in on the Login page.
- Password minimum raised to 10 characters (signup + change password).

## Supabase dashboard settings (not settable via SQL here)

Flip these in **Authentication → Settings** for full global hardening:
- **Leaked password protection** (HIBP) — reject passwords found in known breaches
- **Minimum password length** ≥ 10 (server-side enforcement)
- **Email rate limits** — keep defaults (e.g., 30/h) or tighten per policy
- **JWT expiry** — default 3600 s is reasonable; shorten for stricter tenants
- Optional: **Enforce MFA** at the project level once tenants are onboarded

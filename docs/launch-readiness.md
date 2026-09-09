# Phase E — Launch Readiness

## Data rights implemented

Organization administrators can use **Administration → Organization** to:

- Export organization profile, memberships, fleet records, retained telemetry,
  alerts, events, trips, maintenance records, and audit logs for the last 180
  days as JSON.
- Permanently delete an organization after typing the exact organization name.
  The deletion is role-gated and cascades organization-owned records through
  foreign keys.

Every export and deletion is recorded in `privacy_requests`. The ledger keeps
its row when an organization is deleted (`organization_id` becomes null), so
there is a durable compliance record outside the deleted tenant.

## Privacy workflows

Large exports now use an asynchronous request/worker flow:

1. An organization administrator creates a pending export request.
2. The worker processes it with service-role access.
3. The result is stored in the private `privacy-exports` bucket.
4. A one-hour signed URL is returned to the administrator.

Set `PRIVACY_WORKER_SECRET` and invoke `privacy-export-worker` from a protected
scheduler. The current SQL export still materializes the payload in one job;
chunked table reads or a streaming archive are required before very large
enterprise exports.

Account erasure is intentionally separate from organization deletion. The
profile page creates an `account_erasure_requests` record. Requests are blocked
while the user has organization memberships, preventing accidental loss of
organization ownership. A service-side processor must complete eligible
requests only after retention and legal-hold checks.

Legal counsel must approve the privacy notice, DPA, subprocessors, retention
schedule, cross-border transfer language, and deletion exceptions.

## Billing and entitlements

Organizations currently have a `plan` field. Phase E adds server-side helpers:

- `organization_entitlements(org_id)` returns plan limits and current usage.
- `organization_can_provision(org_id, resource, quantity)` checks devices,
  vehicles, and users against plan limits.

Default limits:

| Plan | Devices | Vehicles | Users | Raw retention target |
|---|---:|---:|---:|---:|
| TRIAL | 10 | 10 | 5 | 90 days |
| STARTER | 100 | 100 | 20 | 180 days |
| PROFESSIONAL | 1,000 | 1,000 | 100 | 365 days |
| ENTERPRISE | 100,000 | 100,000 | 1,000 | 730 days |

These helpers are paired with an idempotent `billing_events` ledger and a
Stripe-signature-verified `billing-webhook` function. Set
`STRIPE_WEBHOOK_SECRET` in Supabase Edge Function secrets and configure Stripe
to send subscription events with `organization_id` and `plan` metadata. Never
collect card numbers in this application.

Device, vehicle, and user creation paths now call the server-side entitlement
check. Any future provisioning RPC must call the same helper before inserting
rows; client-only checks are not sufficient.

## Restore, queue, and collector scale gates

The restore drill must use a separate staging project, restore the database and
storage bucket, replay a representative collector backlog, verify tenant RLS,
and record measured RPO/RTO. Run the HTTP and TCP harnesses at 1k, 10k, and
100k simulated trackers only against isolated staging infrastructure.

The durable queue decision must compare direct RPC ingestion with a managed
queue or Redis Streams based on burst rate, replay requirements, ordering,
backpressure, cost, and operational ownership. Do not enable a queue merely to
hide database saturation.

For collector horizontal scaling, document TCP load-balancer stickiness (or
shared connection state), shared-secret rotation, reconnect storm limits,
ordered per-device batches, health checks, graceful draining, and duplicate
packet handling. Complete a reconnect test before increasing production fleet
limits.

## Global launch gates

- [ ] Supabase production plan, backups, PITR window, and support tier recorded
- [ ] Restore drill completed in a separate staging project
- [ ] RPO/RTO measured and approved per plan tier
- [ ] 1k and 10k staging load tests completed
- [ ] 100k capacity test completed or an approved phased rollout plan exists
- [ ] Durable queue decision completed
- [ ] Collector horizontal scaling and TCP load-balancer design approved
- [ ] Current and next telemetry partitions verified
- [ ] Default-partition clock/GPS anomalies reviewed
- [ ] Realtime tenant-isolation test completed
- [ ] MFA and leaked-password protection enabled in Supabase Auth settings
- [ ] Privacy notice, DPA, subprocessors, and retention policy approved
- [ ] Data export and deletion drill completed
- [ ] Billing webhook idempotency and entitlement downgrade behavior tested
- [ ] Incident escalation contacts and status communication process assigned
- [ ] Security review covers service-role handling, collector secret rotation,
      RLS, audit logs, and destructive admin actions

## Recommended commercial rollout

1. Internal staging and restore drill
2. Pilot with one organization and low device count
3. Paid beta with explicit fleet-size caps
4. Regional rollout with monitored capacity ceilings
5. Enterprise rollout only after the 100k test and queue decision

Do not advertise “100% global scale” until the infrastructure tests, legal
approvals, provider contracts, and recovery drills are complete.

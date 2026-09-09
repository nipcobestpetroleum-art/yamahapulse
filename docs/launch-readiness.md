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

### Privacy limitations to address before a legal launch

- The export is synchronous and limited to the retained 180-day telemetry
  window. Large enterprise exports need an asynchronous object-storage job with
  signed download URLs.
- Account deletion is separate from organization deletion. A user requesting
  account erasure must be removed from `auth.users` only after confirming they
  have no remaining organization memberships or legal-retention obligations.
- Legal counsel must approve the privacy notice, DPA, subprocessors, retention
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

These helpers are the entitlement foundation, not a payment processor. Before
charging customers, integrate a PCI-compliant provider (Stripe or equivalent)
through a server-side billing webhook and update plans only from verified
provider events. Never collect card numbers in this application.

Before enabling enforcement in every create dialog, add the helper check to
server-side provisioning RPCs. Client-only checks are not sufficient.

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

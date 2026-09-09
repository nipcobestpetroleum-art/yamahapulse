create table if not exists public.privacy_requests (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  request_type text not null check (request_type in ('EXPORT', 'DELETE')),
  status text not null default 'COMPLETED' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists privacy_requests_org_time_idx on public.privacy_requests (organization_id, created_at desc);
create index if not exists privacy_requests_requested_by_idx on public.privacy_requests (requested_by, created_at desc);

grant select on public.privacy_requests to service_role;
grant insert on public.privacy_requests to service_role;
grant update on public.privacy_requests to service_role;
alter table public.privacy_requests enable row level security;
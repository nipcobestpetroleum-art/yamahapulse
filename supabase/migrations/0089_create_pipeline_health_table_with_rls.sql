create table if not exists public.pipeline_health (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recorded_at timestamptz default now() not null,
  active_devices int not null,
  reporting_15m int not null,
  reporting_1h int not null,
  reporting_24h int not null,
  stale_devices int not null,
  positions_15m bigint not null,
  issues jsonb not null default '[]',
  created_at timestamptz default now() not null
);

create index pipeline_health_org_time_idx on public.pipeline_health (organization_id, recorded_at desc);

grant select, insert, update, delete on public.pipeline_health to service_role;
grant select on public.pipeline_health to authenticated;

alter table public.pipeline_health enable row level security;

create policy pipeline_health_select on public.pipeline_health
  for select to authenticated
  using (organization_id in (select public.current_user_org_ids()));
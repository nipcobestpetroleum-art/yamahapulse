do $$
declare
  v_min date;
  v_max date;
  v_m date;
  v_child text;
  v_start text;
  v_end text;
begin
  if to_regclass('public.device_events') is null then
    raise exception 'public.device_events not found';
  end if;
  if to_regclass('public.device_events_new') is not null then
    raise exception 'public.device_events_new already exists — previous migration attempt?';
  end if;

  create table public.device_events_new (
    id uuid default gen_random_uuid() not null,
    organization_id uuid not null,
    device_id uuid not null,
    vehicle_id uuid,
    type text not null,
    severity text default 'info' not null,
    message text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone default now() not null,
    metadata jsonb default '{}'::jsonb not null,
    speed numeric,
    constraint device_events_new_pkey primary key (id, created_at),
    constraint device_events_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint device_events_device_id_fkey foreign key (device_id) references public.gps_devices(id) on delete cascade,
    constraint device_events_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null
  ) partition by range (created_at);

  select (min(created_at) at time zone 'utc')::date, (max(created_at) at time zone 'utc')::date
    into v_min, v_max from public.device_events;
  if v_min is null then
    v_min := (now() at time zone 'utc')::date;
  end if;
  v_min := date_trunc('month', v_min)::date;
  v_max := greatest(date_trunc('month', v_max)::date, date_trunc('month', (now() at time zone 'utc'))::date) + interval '1 month';
  v_max := v_max::date;

  v_m := v_min;
  while v_m <= v_max loop
    v_child := 'device_events_' || to_char(v_m, 'YYYYMM');
    v_start := to_char(v_m, 'YYYY-MM-DD') || ' 00:00:00+00';
    v_end := to_char((v_m + interval '1 month')::date, 'YYYY-MM-DD') || ' 00:00:00+00';
    execute format('create table if not exists public.%I partition of public.device_events_new for values from (%L) to (%L)', v_child, v_start, v_end);
    execute format('grant select, insert, update, delete on public.%I to service_role', v_child);
    execute format('grant select on public.%I to authenticated', v_child);
    v_m := (v_m + interval '1 month')::date;
  end loop;

  insert into public.device_events_new (
    id, organization_id, device_id, vehicle_id, type, severity, message,
    latitude, longitude, created_at, metadata, speed
  )
  select
    id, organization_id, device_id, vehicle_id, type, severity, message,
    latitude, longitude, created_at, metadata, speed
  from public.device_events;

  drop table public.device_events;
  alter table public.device_events_new rename to device_events;
  alter table public.device_events rename constraint device_events_new_pkey to device_events_pkey;

  create index device_events_device_idx on public.device_events (device_id, created_at desc);
  create index device_events_org_time_idx on public.device_events (organization_id, created_at desc);

  -- Safety net for out-of-range timestamps (device clock drift)
  create table public.device_events_default partition of public.device_events default;
  create index device_events_default_created_at_idx on public.device_events_default (created_at);
  grant select, insert, update, delete on public.device_events_default to service_role;
  grant select on public.device_events_default to authenticated;

  grant select, insert, update, delete on public.device_events to service_role;
  grant select on public.device_events to authenticated;

  alter table public.device_events enable row level security;
  drop policy if exists device_events_select on public.device_events;
  create policy device_events_select on public.device_events
    for select to authenticated
    using (organization_id in (select public.current_user_org_ids()));

  raise notice 'device_events migrated: partitions from % to %', v_min, v_max;
end $$;
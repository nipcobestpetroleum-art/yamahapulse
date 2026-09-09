do $$
declare
  v_min date;
  v_max date;
  v_m date;
  v_child text;
  v_start text;
  v_end text;
begin
  if to_regclass('public.positions') is null then
    raise exception 'public.positions not found';
  end if;
  if to_regclass('public.positions_new') is not null then
    raise exception 'public.positions_new already exists — previous migration attempt?';
  end if;

  create table public.positions_new (
    id uuid default gen_random_uuid() not null,
    organization_id uuid not null,
    device_id uuid not null,
    vehicle_id uuid,
    recorded_at timestamp with time zone not null,
    latitude double precision not null,
    longitude double precision not null,
    speed numeric,
    course numeric,
    altitude numeric,
    accuracy numeric,
    address text,
    battery_level numeric,
    ignition boolean,
    created_at timestamp with time zone default now() not null,
    door_open boolean,
    external_power boolean,
    satellites integer,
    hdop numeric(4,1),
    pdop numeric(4,1),
    gnss_status integer,
    gsm_signal integer,
    gsm_operator integer,
    sleep_mode integer,
    movement boolean,
    battery_voltage_mv integer,
    battery_current_ma integer,
    external_voltage_mv integer,
    constraint positions_new_pkey primary key (id, recorded_at),
    constraint positions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint positions_device_id_fkey foreign key (device_id) references public.gps_devices(id) on delete cascade,
    constraint positions_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null
  ) partition by range (recorded_at);

  select (min(recorded_at) at time zone 'utc')::date, (max(recorded_at) at time zone 'utc')::date
    into v_min, v_max from public.positions;
  if v_min is null then
    v_min := (now() at time zone 'utc')::date;
  end if;
  v_min := date_trunc('month', v_min)::date;
  v_max := greatest(date_trunc('month', v_max)::date, date_trunc('month', (now() at time zone 'utc'))::date) + interval '1 month';
  v_max := v_max::date;

  v_m := v_min;
  while v_m <= v_max loop
    v_child := 'positions_' || to_char(v_m, 'YYYYMM');
    v_start := to_char(v_m, 'YYYY-MM-DD') || ' 00:00:00+00';
    v_end := to_char((v_m + interval '1 month')::date, 'YYYY-MM-DD') || ' 00:00:00+00';
    execute format('create table if not exists public.%I partition of public.positions_new for values from (%L) to (%L)', v_child, v_start, v_end);
    execute format('grant select, insert, update, delete on public.%I to service_role', v_child);
    execute format('grant select on public.%I to authenticated', v_child);
    v_m := (v_m + interval '1 month')::date;
  end loop;

  insert into public.positions_new (
    id, organization_id, device_id, vehicle_id, recorded_at, latitude, longitude,
    speed, course, altitude, accuracy, address, battery_level, ignition, created_at,
    door_open, external_power, satellites, hdop, pdop, gnss_status, gsm_signal,
    gsm_operator, sleep_mode, movement, battery_voltage_mv, battery_current_ma, external_voltage_mv
  )
  select
    id, organization_id, device_id, vehicle_id, recorded_at, latitude, longitude,
    speed, course, altitude, accuracy, address, battery_level, ignition, created_at,
    door_open, external_power, satellites, hdop, pdop, gnss_status, gsm_signal,
    gsm_operator, sleep_mode, movement, battery_voltage_mv, battery_current_ma, external_voltage_mv
  from public.positions;

  drop table public.positions;
  alter table public.positions_new rename to positions;
  alter table public.positions rename constraint positions_new_pkey to positions_pkey;

  create index positions_device_time_idx on public.positions (device_id, recorded_at desc);
  create index positions_org_time_idx on public.positions (organization_id, recorded_at desc);

  -- Safety net for out-of-range timestamps (device clock drift)
  create table public.positions_default partition of public.positions default;
  create index positions_default_recorded_at_idx on public.positions_default (recorded_at);
  grant select, insert, update, delete on public.positions_default to service_role;
  grant select on public.positions_default to authenticated;

  grant select, insert, update, delete on public.positions to service_role;
  grant select on public.positions to authenticated;

  alter table public.positions enable row level security;
  drop policy if exists positions_select on public.positions;
  create policy positions_select on public.positions
    for select to authenticated
    using (organization_id in (select public.current_user_org_ids()));

  raise notice 'positions migrated: partitions from % to %', v_min, v_max;
end $$;
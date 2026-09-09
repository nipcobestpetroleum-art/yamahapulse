create or replace function public.ingest_position(
  p_imei text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_speed_kmh numeric default null,
  p_course numeric default null,
  p_altitude numeric default null,
  p_accuracy numeric default null,
  p_battery numeric default null,
  p_ignition boolean default null,
  p_door_open boolean default null,
  p_external_power boolean default null,
  p_satellites integer default null,
  p_hdop numeric default null,
  p_pdop numeric default null,
  p_gnss_status integer default null,
  p_gsm_signal integer default null,
  p_gsm_operator integer default null,
  p_sleep_mode integer default null,
  p_movement boolean default null,
  p_battery_voltage_mv integer default null,
  p_battery_current_ma integer default null,
  p_external_voltage_mv integer default null,
  p_harsh_accel boolean default null,
  p_harsh_brake boolean default null,
  p_harsh_corner boolean default null,
  p_crash boolean default null,
  p_gforce numeric default null,
  p_towing boolean default null,
  p_jamming boolean default null,
  p_panic boolean default null,
  p_alarm boolean default null,
  p_ibutton text default null,
  p_temperature numeric default null,
  p_humidity numeric default null,
  p_odometer_km numeric default null,
  p_engine_hours numeric default null,
  p_recorded_at timestamptz default now(),
  p_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  v_device_id uuid;
  v_org uuid;
  v_device_found boolean;
  v_vehicle_id uuid;
  v_prev record;
  v_has_prev boolean;
  v_now timestamptz := now();
  v_recorded timestamptz := coalesce(p_recorded_at, now());
  v_is_idling boolean;
  v_idle_since timestamptz;
  v_idle_alerted boolean;
  v_idle_rule_minutes int;
  v_idle_minutes numeric := 0;
  v_low_battery_alerted boolean;
  v_low_battery_triggered boolean := false;
  v_battery_threshold numeric;
  v_events jsonb := '[]'::jsonb;
  v_critical jsonb := null;
  v_gf record;
  v_dlat double precision;
  v_dlon double precision;
  v_a double precision;
  v_center_lat double precision;
  v_center_lon double precision;
  v_radius double precision;
  v_dist_m double precision;
  v_inside_ids uuid[] := '{}';
  v_inside_names jsonb := '{}'::jsonb;
  v_now_inside boolean;
  v_was_inside boolean;
  v_rule record;
  v_zone_limit numeric;
  v_zone_geofence_id uuid;
  v_global_limit numeric;
  v_active_limit numeric;
  v_zone_name text;
  v_vehicle record;
  v_vehicle_found boolean;
  v_new_odometer numeric;
  v_new_engine_hours numeric;
  v_delta_km double precision;
  v_elapsed_hours double precision;
  v_interval record;
  v_open_sched_id uuid;
  v_last_done record;
  v_due_now boolean;
  v_due_odometer numeric;
  v_due_ts timestamptz;
  v_due_date date;
  v_due_engine_hours numeric;
  v_label text;
  v_falling boolean;
  v_rising boolean;
  v_trip_id uuid;
  v_trip_start_time timestamptz;
  v_trip_start_odo numeric;
  v_driver record;
  v_cmd record;
  v_sensor record;
begin
  -- Resolve device by IMEI
  select gd.id, gd.organization_id
    into v_device_id, v_org
    from public.gps_devices gd
    where gd.imei = p_imei;
  v_device_found := found;
  if not v_device_found then
    return jsonb_build_object('error', 'UNKNOWN_DEVICE');
  end if;

  -- Connectivity test: no writes
  if p_test then
    return jsonb_build_object('ok', true, 'test', true, 'device_id', v_device_id);
  end if;

  -- Current vehicle assignment
  select da.vehicle_id into v_vehicle_id
    from public.device_assignments da
    where da.device_id = v_device_id and da.unassigned_at is null
    limit 1;

  -- Previous snapshot (for derivations)
  select lp.latitude, lp.longitude, lp.recorded_at, lp.ignition, lp.door_open,
         lp.external_power, lp.idle_since, lp.idle_alerted, lp.low_battery_alerted,
         lp.satellites, lp.movement
    into v_prev
    from public.latest_positions lp
    where lp.device_id = v_device_id;
  v_has_prev := found;

  -- Replay protection: nothing at or before the newest stored record is
  -- accepted — blocks re-sent batches (e.g. collector retry after a lost
  -- response) and forged replays. Makes ingestion idempotent.
  if v_has_prev and v_recorded <= v_prev.recorded_at then
    return jsonb_build_object('ok', true, 'device_id', v_device_id,
      'organization_id', v_org, 'deduped', true, 'critical_events', '[]'::jsonb);
  end if;

  -- Flood protection: sub-second gaps are always noise (AVL resolution is 1 s).
  if v_has_prev and (v_recorded - v_prev.recorded_at) < interval '1 second' then
    return jsonb_build_object('ok', true, 'device_id', v_device_id,
      'organization_id', v_org, 'throttled', true, 'critical_events', '[]'::jsonb);
  end if;

  -- 1) History row
  insert into public.positions (
    device_id, organization_id, vehicle_id, recorded_at, latitude, longitude,
    speed, course, altitude, accuracy, battery_level, ignition, created_at,
    door_open, external_power, satellites, hdop, pdop, gnss_status, gsm_signal,
    gsm_operator, sleep_mode, movement, battery_voltage_mv, battery_current_ma,
    external_voltage_mv
  ) values (
    v_device_id, v_org, v_vehicle_id, v_recorded, p_latitude, p_longitude,
    p_speed_kmh, p_course, p_altitude, p_accuracy, p_battery, p_ignition, v_now,
    p_door_open, p_external_power, p_satellites, p_hdop, p_pdop, p_gnss_status, p_gsm_signal,
    p_gsm_operator, p_sleep_mode, p_movement, p_battery_voltage_mv, p_battery_current_ma,
    p_external_voltage_mv
  );

  -- 2) Excessive idling
  v_is_idling := (p_ignition is true) and (p_speed_kmh is not null) and (p_speed_kmh <= 2);
  v_idle_since := v_prev.idle_since;
  v_idle_alerted := coalesce(v_prev.idle_alerted, false);
  if v_is_idling then
    if v_idle_since is null then v_idle_since := v_recorded; end if;
  else
    v_idle_since := null;
    v_idle_alerted := false;
  end if;

  if v_is_idling and v_idle_since is not null and not v_idle_alerted then
    select ar.idle_minutes into v_idle_rule_minutes
      from public.alert_rules ar
      where ar.organization_id = v_org and ar.type = 'IDLE' and ar.enabled
        and ar.idle_minutes is not null
      limit 1;
    if v_idle_rule_minutes is not null then
      v_idle_minutes := round(extract(epoch from (v_recorded - v_idle_since)) / 60.0);
      if v_idle_minutes >= v_idle_rule_minutes then
        v_idle_alerted := true;
      end if;
    end if;
  end if;

  -- 3) Low battery (debounced)
  v_low_battery_alerted := coalesce(v_prev.low_battery_alerted, false);
  if p_battery is not null then
    select ar.battery_threshold into v_battery_threshold
      from public.alert_rules ar
      where ar.organization_id = v_org and ar.type = 'LOW_BATTERY' and ar.enabled
        and ar.battery_threshold is not null
      limit 1;
    if v_battery_threshold is not null then
      if p_battery < v_battery_threshold then
        if not v_low_battery_alerted then v_low_battery_triggered := true; end if;
        v_low_battery_alerted := true;
      elsif p_battery >= v_battery_threshold + 5 then
        v_low_battery_alerted := false;
      end if;
    end if;
  end if;

  -- 4) Live snapshot
  insert into public.latest_positions (
    device_id, organization_id, vehicle_id, recorded_at, latitude, longitude,
    speed, course, altitude, accuracy, battery_level, ignition, updated_at,
    door_open, external_power, idle_since, idle_alerted, low_battery_alerted,
    satellites, hdop, pdop, gnss_status, gsm_signal, gsm_operator, sleep_mode,
    movement, battery_voltage_mv, battery_current_ma, external_voltage_mv
  ) values (
    v_device_id, v_org, v_vehicle_id, v_recorded, p_latitude, p_longitude,
    p_speed_kmh, p_course, p_altitude, p_accuracy, p_battery, p_ignition, v_now,
    p_door_open, p_external_power, v_idle_since, v_idle_alerted, v_low_battery_alerted,
    p_satellites, p_hdop, p_pdop, p_gnss_status, p_gsm_signal, p_gsm_operator, p_sleep_mode,
    p_movement, p_battery_voltage_mv, p_battery_current_ma, p_external_voltage_mv
  )
  on conflict (device_id) do update set
    organization_id = excluded.organization_id,
    vehicle_id = excluded.vehicle_id,
    recorded_at = excluded.recorded_at,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    speed = excluded.speed,
    course = excluded.course,
    altitude = excluded.altitude,
    accuracy = excluded.accuracy,
    battery_level = excluded.battery_level,
    ignition = excluded.ignition,
    updated_at = excluded.updated_at,
    door_open = excluded.door_open,
    external_power = excluded.external_power,
    idle_since = excluded.idle_since,
    idle_alerted = excluded.idle_alerted,
    low_battery_alerted = excluded.low_battery_alerted,
    satellites = excluded.satellites,
    hdop = excluded.hdop,
    pdop = excluded.pdop,
    gnss_status = excluded.gnss_status,
    gsm_signal = excluded.gsm_signal,
    gsm_operator = excluded.gsm_operator,
    sleep_mode = excluded.sleep_mode,
    movement = excluded.movement,
    battery_voltage_mv = excluded.battery_voltage_mv,
    battery_current_ma = excluded.battery_current_ma,
    external_voltage_mv = excluded.external_voltage_mv;

  -- 5) Device heartbeat
  update public.gps_devices gd
    set last_seen_at = v_now,
        status = (case when gd.status = 'IN_STOCK' then 'ACTIVE' else gd.status end)::public.device_status
    where gd.id = v_device_id;

  -- 6) Behaviour / safety / transition events
  if p_harsh_accel is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','HARSH_ACCEL','severity','warning','message','Harsh acceleration detected'));
  end if;
  if p_harsh_brake is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','HARSH_BRAKE','severity','warning','message','Harsh braking detected'));
  end if;
  if p_harsh_corner is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','HARSH_CORNER','severity','warning','message','Harsh cornering detected'));
  end if;
  if p_towing is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','TOWING','severity','critical','message','Vehicle moved while ignition is off — possible towing'));
  end if;
  if p_jamming is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','JAMMING','severity','critical','message','GSM signal jamming detected'));
  end if;
  if p_panic is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','PANIC','severity','critical','message','Panic/SOS button pressed'));
  end if;
  if p_alarm is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','ALARM','severity','critical','message','Vehicle alarm triggered'));
  end if;
  if p_door_open is not null and v_has_prev and p_door_open is distinct from v_prev.door_open then
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'type', case when p_door_open then 'DOOR_OPEN' else 'DOOR_CLOSE' end,
      'severity', case when p_door_open then 'warning' else 'info' end,
      'message', case when p_door_open then 'Door opened' else 'Door closed' end));
  end if;
  if p_ignition is true and v_prev.ignition is false then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','IGNITION_ON','severity','info','message','Ignition turned on'));
  end if;
  if p_ignition is false and v_prev.ignition is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','IGNITION_OFF','severity','info','message','Ignition turned off'));
  end if;
  if p_movement is true and v_prev.movement is false then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','MOVING','severity','info','message','Movement started'));
  end if;
  if p_movement is false and v_prev.movement is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object('type','STOPPED','severity','info','message','Movement stopped'));
  end if;
  if p_satellites is not null and v_prev.satellites is not null then
    if p_satellites = 0 and v_prev.satellites > 0 then
      v_events := v_events || jsonb_build_array(jsonb_build_object('type','GPS_LOST','severity','warning','message','GNSS fix lost — no satellites in view'));
    elsif p_satellites > 0 and v_prev.satellites = 0 then
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'type','GPS_RESTORED','severity','info',
        'message','GNSS fix restored (' || p_satellites || ' satellites)'));
    end if;
  end if;
  if p_crash is true then
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'type','CRASH','severity','critical',
      'message', case when p_gforce is not null
                      then 'Crash detected (' || round(p_gforce, 1) || 'G)'
                      else 'Crash detected' end,
      'metadata', jsonb_build_object('gforce', p_gforce)));
  end if;
  if p_external_power is not null and v_prev.external_power is not null
     and p_external_power is distinct from v_prev.external_power then
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'type', case when p_external_power then 'POWER_RESTORED' else 'POWER_CUT' end,
      'severity', case when p_external_power then 'info' else 'critical' end,
      'message', case when p_external_power then 'External power restored' else 'External power lost — possible tamper or unplug' end));
  end if;
  if v_is_idling and v_idle_alerted and v_idle_minutes > 0 then
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'type','IDLE','severity','warning',
      'message','Vehicle idling for over ' || round(v_idle_minutes) || ' minutes',
      'metadata', jsonb_build_object('idle_minutes', round(v_idle_minutes))));
  end if;
  if v_low_battery_triggered and v_battery_threshold is not null then
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'type','LOW_BATTERY','severity','warning',
      'message','Device battery at ' || p_battery || '% — below the ' || v_battery_threshold || '% threshold',
      'metadata', jsonb_build_object('battery', p_battery, 'threshold', v_battery_threshold)));
  end if;

  -- 7) Geofence containment (circles: center = [lat, lng])
  for v_gf in
    select gf.id, gf.name, gf.geometry
      from public.geofences gf
      where gf.organization_id = v_org and gf.is_active
  loop
    if v_gf.geometry->>'type' = 'circle' then
      v_center_lat := (v_gf.geometry->'coordinates'->'center'->>0)::double precision;
      v_center_lon := (v_gf.geometry->'coordinates'->'center'->>1)::double precision;
      v_radius := (v_gf.geometry->'coordinates'->>'radius')::double precision;
      v_dlat := radians(p_latitude - v_center_lat);
      v_dlon := radians(p_longitude - v_center_lon);
      v_a := sin(v_dlat / 2) ^ 2
             + cos(radians(v_center_lat)) * cos(radians(p_latitude)) * sin(v_dlon / 2) ^ 2;
      v_dist_m := 6371 * 2 * atan2(sqrt(v_a), sqrt(1 - v_a)) * 1000;
      if v_dist_m <= v_radius then
        v_inside_ids := v_inside_ids || v_gf.id;
        v_inside_names := v_inside_names || jsonb_build_object(v_gf.id::text, v_gf.name);
      end if;
    end if;
  end loop;

  if exists (select 1 from public.geofences gf where gf.organization_id = v_org and gf.is_active) then
    for v_gf in
      select gf.id, gf.name
        from public.geofences gf
        where gf.organization_id = v_org and gf.is_active
    loop
      v_now_inside := v_gf.id = any(v_inside_ids);
      select coalesce(gs.inside, false) into v_was_inside
        from public.geofence_states gs
        where gs.device_id = v_device_id and gs.geofence_id = v_gf.id;
      if v_was_inside is null then v_was_inside := false; end if;
      if v_now_inside is distinct from v_was_inside then
        v_events := v_events || jsonb_build_array(jsonb_build_object(
          'type', case when v_now_inside then 'GEOFENCE_ENTER' else 'GEOFENCE_EXIT' end,
          'severity', 'info',
          'message', 'Vehicle ' || (case when v_now_inside then 'entered ' else 'exited ' end) || v_gf.name,
          'metadata', jsonb_build_object('geofence_id', v_gf.id, 'geofence_name', v_gf.name)));
        insert into public.geofence_states (device_id, geofence_id, organization_id, inside, updated_at)
        values (v_device_id, v_gf.id, v_org, v_now_inside, v_now)
        on conflict (device_id, geofence_id)
        do update set inside = excluded.inside, updated_at = excluded.updated_at;
      end if;
    end loop;
  end if;

  -- 8) Overspeed (zone rule takes priority over global)
  if p_speed_kmh is not null then
    v_zone_limit := null; v_zone_geofence_id := null; v_global_limit := null;
    for v_rule in
      select ar.speed_limit, ar.geofence_id
        from public.alert_rules ar
        where ar.organization_id = v_org and ar.type = 'OVERSPEED'
          and ar.enabled and ar.speed_limit is not null
    loop
      if v_rule.geofence_id is not null and v_rule.geofence_id = any(v_inside_ids) and v_zone_limit is null then
        v_zone_limit := v_rule.speed_limit;
        v_zone_geofence_id := v_rule.geofence_id;
      elsif v_rule.geofence_id is null and v_global_limit is null then
        v_global_limit := v_rule.speed_limit;
      end if;
    end loop;
    v_active_limit := coalesce(v_zone_limit, v_global_limit);
    if v_active_limit is not null and p_speed_kmh > v_active_limit then
      if v_zone_geofence_id is not null then
        v_zone_name := v_inside_names->>(v_zone_geofence_id::text);
      end if;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'type','OVERSPEED','severity','warning',
        'message', case when v_zone_name is not null
                        then 'Speed ' || p_speed_kmh || ' km/h exceeds ' || v_zone_name || ' zone limit of ' || v_active_limit || ' km/h'
                        else 'Speed ' || p_speed_kmh || ' km/h exceeds limit of ' || v_active_limit || ' km/h' end,
        'metadata', jsonb_build_object('limit', v_active_limit, 'geofence_id', v_zone_geofence_id)));
    end if;
  end if;

  -- 9) Persist events + critical alerts
  if jsonb_array_length(v_events) > 0 then
    insert into public.device_events (organization_id, device_id, vehicle_id, type, severity, message, latitude, longitude, speed, metadata)
    select v_org, v_device_id, v_vehicle_id, e->>'type', e->>'severity', e->>'message',
           p_latitude, p_longitude, p_speed_kmh, coalesce(e->'metadata', '{}'::jsonb)
    from jsonb_array_elements(v_events) e;

    v_critical := (
      select jsonb_agg(e)
      from jsonb_array_elements(v_events) e
      where e->>'type' in ('PANIC','CRASH','TOWING','JAMMING','ALARM','POWER_CUT','LOW_BATTERY')
    );
    if v_critical is not null then
      insert into public.alerts (organization_id, device_id, vehicle_id, type, severity, message, latitude, longitude)
      select v_org, v_device_id, v_vehicle_id, e->>'type', e->>'severity', e->>'message', p_latitude, p_longitude
      from jsonb_array_elements(v_critical) e;
    end if;
  end if;

  -- 10) Odometer & engine-hour tracking, maintenance, trips
  if v_vehicle_id is not null then
    select v.odometer, v.engine_hours into v_vehicle
      from public.vehicles v
      where v.id = v_vehicle_id;
    v_vehicle_found := found;
    if v_vehicle_found then
      v_new_odometer := coalesce(v_vehicle.odometer, 0);
      v_new_engine_hours := coalesce(v_vehicle.engine_hours, 0);

      if p_odometer_km is not null then
        v_new_odometer := p_odometer_km;
      elsif v_has_prev then
        v_dlat := radians(p_latitude - v_prev.latitude);
        v_dlon := radians(p_longitude - v_prev.longitude);
        v_a := sin(v_dlat / 2) ^ 2
               + cos(radians(v_prev.latitude)) * cos(radians(p_latitude)) * sin(v_dlon / 2) ^ 2;
        v_delta_km := 6371 * 2 * atan2(sqrt(v_a), sqrt(1 - v_a));
        if v_delta_km > 0 and v_delta_km < 5 then
          v_new_odometer := round((v_new_odometer + v_delta_km)::numeric, 2);
        end if;
      end if;

      if p_engine_hours is not null then
        v_new_engine_hours := p_engine_hours;
      elsif v_has_prev and p_ignition is true then
        v_elapsed_hours := extract(epoch from (v_recorded - v_prev.recorded_at)) / 3600.0;
        if v_elapsed_hours > 0 and v_elapsed_hours < 1 then
          v_new_engine_hours := round((v_new_engine_hours + v_elapsed_hours)::numeric, 2);
        end if;
      end if;

      if (v_new_odometer is distinct from v_vehicle.odometer)
         or (v_new_engine_hours is distinct from v_vehicle.engine_hours) then
        update public.vehicles
          set odometer = v_new_odometer, engine_hours = v_new_engine_hours
          where id = v_vehicle_id;
      end if;

      -- Mark overdue schedules
      update public.maintenance_schedules ms
        set status = 'OVERDUE', updated_at = v_now
        where ms.organization_id = v_org and ms.vehicle_id = v_vehicle_id
          and ms.status = 'SCHEDULED'
          and ms.due_date < (v_now at time zone 'utc')::date;
      update public.maintenance_schedules ms
        set status = 'OVERDUE', updated_at = v_now
        where ms.organization_id = v_org and ms.vehicle_id = v_vehicle_id
          and ms.status = 'SCHEDULED'
          and ms.due_odometer <= v_new_odometer;
      update public.maintenance_schedules ms
        set status = 'OVERDUE', updated_at = v_now
        where ms.organization_id = v_org and ms.vehicle_id = v_vehicle_id
          and ms.status = 'SCHEDULED'
          and ms.due_engine_hours <= v_new_engine_hours;

      -- Auto-generate schedules from intervals
      for v_interval in
        select mi.id, mi.service_type, mi.interval_km, mi.interval_days, mi.interval_hours
          from public.maintenance_intervals mi
          where mi.organization_id = v_org and mi.is_active
            and (mi.vehicle_id = v_vehicle_id or mi.vehicle_id is null)
      loop
        select ms.id into v_open_sched_id
          from public.maintenance_schedules ms
          where ms.vehicle_id = v_vehicle_id
            and ms.service_type = v_interval.service_type
            and ms.status in ('SCHEDULED', 'OVERDUE')
          limit 1;
        continue when found;

        select ms.due_odometer, ms.due_engine_hours, ms.completed_at into v_last_done
          from public.maintenance_schedules ms
          where ms.vehicle_id = v_vehicle_id
            and ms.service_type = v_interval.service_type
            and ms.status = 'COMPLETED'
          order by ms.completed_at desc
          limit 1;

        v_due_now := false; v_due_odometer := null; v_due_date := null; v_due_engine_hours := null;

        if v_interval.interval_km is not null then
          v_due_odometer := round(coalesce(v_last_done.due_odometer, 0) + v_interval.interval_km, 2);
          if v_new_odometer >= v_due_odometer then v_due_now := true; end if;
        end if;

        if v_interval.interval_days is not null and v_last_done.completed_at is not null then
          v_due_ts := v_last_done.completed_at + make_interval(days => v_interval.interval_days);
          v_due_date := (v_due_ts at time zone 'utc')::date;
          if v_now >= v_due_ts then v_due_now := true; end if;
        end if;

        if v_interval.interval_hours is not null then
          v_due_engine_hours := round(coalesce(v_last_done.due_engine_hours, 0) + v_interval.interval_hours, 2);
          if v_new_engine_hours >= v_due_engine_hours then v_due_now := true; end if;
        end if;

        if v_due_now then
          insert into public.maintenance_schedules
            (organization_id, vehicle_id, service_type, due_date, due_odometer, due_engine_hours, status, auto_generated, notes)
          values (v_org, v_vehicle_id, v_interval.service_type, v_due_date, v_due_odometer, v_due_engine_hours,
                  'SCHEDULED', true,
                  'Auto-generated from telemetry (odometer ' || v_new_odometer || ' km, engine hours ' || v_new_engine_hours || ').');
        end if;
      end loop;

      -- Automatic trip detection from ignition transitions
      v_label := round(p_latitude::numeric, 4)::text || ', ' || round(p_longitude::numeric, 4)::text;
      if p_ignition is not null then
        v_falling := (p_ignition is false) and (v_prev.ignition is true);
        v_rising := (p_ignition is true) and (v_prev.ignition is distinct from true);

        if v_falling or v_rising then
          select t.id, t.start_odometer into v_trip_id, v_trip_start_odo
            from public.trips t
            where t.vehicle_id = v_vehicle_id and t.status = 'IN_PROGRESS'
            limit 1;
          if found then
            update public.trips
              set end_time = v_recorded,
                  end_location = v_label,
                  distance_km = case when v_trip_start_odo is not null and v_new_odometer >= v_trip_start_odo
                                     then round(v_new_odometer - v_trip_start_odo, 2)
                                     else null end,
                  status = 'COMPLETED'
              where id = v_trip_id;
          end if;
        end if;

        if v_rising then
          select d.id into v_driver from public.drivers d where d.vehicle_id = v_vehicle_id limit 1;
          insert into public.trips
            (organization_id, vehicle_id, driver_id, start_time, start_location, start_odometer, distance_km, status, auto_generated, notes)
          values (v_org, v_vehicle_id, v_driver.id, v_recorded, v_label, v_new_odometer, 0,
                  'IN_PROGRESS', true, 'Auto-detected from GPS telemetry (ignition)');
        end if;

        if (not v_falling) and (not v_rising) and p_ignition is true then
          select t.id, t.start_time, t.start_odometer into v_trip_id, v_trip_start_time, v_trip_start_odo
            from public.trips t
            where t.vehicle_id = v_vehicle_id and t.status = 'IN_PROGRESS'
            limit 1;
          if found and (v_recorded - v_trip_start_time) > interval '24 hours' then
            update public.trips
              set end_time = v_recorded,
                  end_location = v_label,
                  distance_km = case when v_trip_start_odo is not null and v_new_odometer >= v_trip_start_odo
                                     then round(v_new_odometer - v_trip_start_odo, 2)
                                     else null end,
                  status = 'COMPLETED'
              where id = v_trip_id;
            select d.id into v_driver from public.drivers d where d.vehicle_id = v_vehicle_id limit 1;
            insert into public.trips
              (organization_id, vehicle_id, driver_id, start_time, start_location, start_odometer, distance_km, status, auto_generated, notes)
            values (v_org, v_vehicle_id, v_driver.id, v_recorded, v_label, v_new_odometer, 0,
                    'IN_PROGRESS', true, 'Auto-detected from GPS telemetry (ignition)');
          end if;
        end if;
      end if;
    end if;

    -- iButton driver identification
    if p_ibutton is not null and btrim(p_ibutton) <> '' then
      select d.id, d.name, d.vehicle_id into v_driver
        from public.drivers d
        where d.organization_id = v_org and d.ibutton_id = p_ibutton
        limit 1;
      if found and v_driver.vehicle_id is distinct from v_vehicle_id then
        update public.drivers set vehicle_id = null where vehicle_id = v_vehicle_id;
        update public.drivers set vehicle_id = v_vehicle_id where id = v_driver.id;
        update public.trips set driver_id = v_driver.id
          where vehicle_id = v_vehicle_id and status = 'IN_PROGRESS' and end_time is null;
        insert into public.device_events
          (organization_id, device_id, vehicle_id, type, severity, message, latitude, longitude, metadata)
        values (v_org, v_device_id, v_vehicle_id, 'DRIVER_IDENTIFIED', 'info',
                v_driver.name || ' identified via iButton', p_latitude, p_longitude,
                jsonb_build_object('driver_id', v_driver.id));
      end if;
    end if;

    -- 1-Wire / BLE sensor readings
    if p_temperature is not null then
      for v_sensor in
        select s.id from public.asset_sensors s
        where s.device_id = v_device_id and s.sensor_type = 'TEMPERATURE' and s.is_active
      loop
        insert into public.sensor_readings (organization_id, sensor_id, value, recorded_at)
        values (v_org, v_sensor.id, p_temperature, v_now);
        update public.asset_sensors set last_value = p_temperature, last_reading_at = v_now
        where id = v_sensor.id;
      end loop;
    end if;
    if p_humidity is not null then
      for v_sensor in
        select s.id from public.asset_sensors s
        where s.device_id = v_device_id and s.sensor_type = 'HUMIDITY' and s.is_active
      loop
        insert into public.sensor_readings (organization_id, sensor_id, value, recorded_at)
        values (v_org, v_sensor.id, p_humidity, v_now);
        update public.asset_sensors set last_value = p_humidity, last_reading_at = v_now
        where id = v_sensor.id;
      end loop;
    end if;
  end if;

  -- 11) Pending remote command delivery
  select dc.id, dc.command into v_cmd
    from public.device_commands dc
    where dc.device_id = v_device_id and dc.status = 'PENDING'
    order by dc.requested_at asc
    limit 1;
  if found then
    update public.device_commands set status = 'SENT', sent_at = v_now where id = v_cmd.id;
    update public.gps_devices set engine_immobilized = (v_cmd.command = 'ENGINE_CUT') where id = v_device_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'device_id', v_device_id,
    'organization_id', v_org,
    'vehicle_id', v_vehicle_id,
    'recorded_at', to_char(v_recorded at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'command', v_cmd.command,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'critical_events', coalesce(v_critical, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ingest_position(text, double precision, double precision, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, integer, numeric, numeric, integer, integer, integer, integer, boolean, integer, integer, integer, boolean, boolean, boolean, boolean, numeric, boolean, boolean, boolean, boolean, text, numeric, numeric, numeric, numeric, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.ingest_position(text, double precision, double precision, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, integer, numeric, numeric, integer, integer, integer, integer, boolean, integer, integer, integer, boolean, boolean, boolean, boolean, numeric, boolean, boolean, boolean, boolean, text, numeric, numeric, numeric, numeric, timestamptz, boolean) to service_role;
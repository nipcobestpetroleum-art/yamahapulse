create or replace function public.ingest_position_batch(p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  r jsonb;
  v_results jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    return jsonb_build_object('error', 'INVALID_BATCH');
  end if;

  -- Records are processed strictly in order so per-device state machines
  -- (ignition/trips, debounces, transitions) see a consistent history.
  for r in select * from jsonb_array_elements(p_records)
  loop
    begin
      v_res := public.ingest_position(
        p_imei              := r->>'imei',
        p_latitude          := (r->>'latitude')::double precision,
        p_longitude         := (r->>'longitude')::double precision,
        p_speed_kmh         := (r->>'speed_kmh')::numeric,
        p_course            := (r->>'course')::numeric,
        p_altitude          := (r->>'altitude')::numeric,
        p_accuracy          := (r->>'accuracy')::numeric,
        p_battery           := (r->>'battery')::numeric,
        p_ignition          := (r->>'ignition')::boolean,
        p_door_open         := (r->>'door_open')::boolean,
        p_external_power    := (r->>'external_power')::boolean,
        p_satellites        := (r->>'satellites')::integer,
        p_hdop              := (r->>'hdop')::numeric,
        p_pdop              := (r->>'pdop')::numeric,
        p_gnss_status       := (r->>'gnss_status')::integer,
        p_gsm_signal        := (r->>'gsm_signal')::integer,
        p_gsm_operator      := (r->>'gsm_operator')::integer,
        p_sleep_mode        := (r->>'sleep_mode')::integer,
        p_movement          := (r->>'movement')::boolean,
        p_battery_voltage_mv := (r->>'battery_voltage_mv')::integer,
        p_battery_current_ma := (r->>'battery_current_ma')::integer,
        p_external_voltage_mv := (r->>'external_voltage_mv')::integer,
        p_harsh_accel       := (r->>'harsh_accel')::boolean,
        p_harsh_brake       := (r->>'harsh_brake')::boolean,
        p_harsh_corner      := (r->>'harsh_corner')::boolean,
        p_crash             := (r->>'crash')::boolean,
        p_gforce            := (r->>'gforce')::numeric,
        p_towing            := (r->>'towing')::boolean,
        p_jamming           := (r->>'jamming')::boolean,
        p_panic             := (r->>'panic')::boolean,
        p_alarm             := (r->>'alarm')::boolean,
        p_ibutton           := r->>'ibutton',
        p_temperature       := (r->>'temperature')::numeric,
        p_humidity          := (r->>'humidity')::numeric,
        p_odometer_km       := (r->>'odometer_km')::numeric,
        p_engine_hours      := (r->>'engine_hours')::numeric,
        p_recorded_at       := (r->>'recorded_at')::timestamptz
      );
    exception when others then
      v_res := jsonb_build_object('error', 'RECORD_FAILED', 'detail', SQLERRM);
    end;
    v_results := v_results || jsonb_build_array(v_res);
  end loop;

  return jsonb_build_object('ok', true, 'results', v_results);
end;
$$;

revoke all on function public.ingest_position_batch(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_position_batch(jsonb) to service_role;
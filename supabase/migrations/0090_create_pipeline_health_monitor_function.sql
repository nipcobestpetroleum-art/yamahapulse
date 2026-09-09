create or replace function public.check_pipeline_health(p_simulate_no_data boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  v_org record;
  v_active int;
  v_rep15 int;
  v_rep1h int;
  v_rep24h int;
  v_stale int;
  v_pos15 bigint;
  v_issues jsonb := '[]'::jsonb;
  v_snapshots int := 0;
  v_alerts_raised int := 0;
  v_existing_alert uuid;
begin
  for v_org in
    select o.id as org_id
    from public.organizations o
    where exists (
      select 1 from public.gps_devices gd
      where gd.organization_id = o.id and gd.status in ('ACTIVE', 'ASSIGNED')
    )
  loop
    select count(*) into v_active
      from public.gps_devices gd
      where gd.organization_id = v_org.org_id and gd.status in ('ACTIVE', 'ASSIGNED');

    select count(*) into v_rep15
      from public.latest_positions lp
      where lp.organization_id = v_org.org_id and lp.updated_at > now() - interval '15 minutes';
    select count(*) into v_rep1h
      from public.latest_positions lp
      where lp.organization_id = v_org.org_id and lp.updated_at > now() - interval '1 hour';
    select count(*) into v_rep24h
      from public.latest_positions lp
      where lp.organization_id = v_org.org_id and lp.updated_at > now() - interval '24 hours';

    select count(*) into v_stale
      from public.gps_devices gd
      where gd.organization_id = v_org.org_id and gd.status in ('ACTIVE', 'ASSIGNED')
        and (gd.last_seen_at is null or gd.last_seen_at < now() - interval '24 hours');

    select count(*) into v_pos15
      from public.positions p
      where p.organization_id = v_org.org_id and p.recorded_at > now() - interval '15 minutes';

    v_issues := '[]'::jsonb;

    -- Critical: a fleet that was reporting has gone completely silent —
    -- collector down, ingest broken, or network partition.
    if p_simulate_no_data or (v_pos15 = 0 and v_rep24h > 0) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'NO_DATA_15M', 'severity', 'critical',
        'message', 'No telemetry received in the last 15 minutes although devices reported within 24 h — collector or ingest pipeline may be down.'));
    end if;

    -- Warning: a large share of in-use devices has been silent for 24 h+.
    if v_active > 0 and v_stale::numeric / v_active >= 0.3 and v_stale >= 3 then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'HIGH_STALE', 'severity', 'warning',
        'message', v_stale || ' of ' || v_active || ' in-use devices have not reported for over 24 hours.'));
    end if;

    insert into public.pipeline_health
      (organization_id, active_devices, reporting_15m, reporting_1h, reporting_24h,
       stale_devices, positions_15m, issues)
    values (v_org.org_id, v_active, v_rep15, v_rep1h, v_rep24h, v_stale, v_pos15, v_issues);
    v_snapshots := v_snapshots + 1;

    -- Raise a deduplicated in-app alert for the critical case (max one open
    -- pipeline alert per org per 6 hours).
    if v_issues @> '[{"code":"NO_DATA_15M"}]' then
      select a.id into v_existing_alert
        from public.alerts a
        where a.organization_id = v_org.org_id
          and a.type = 'PIPELINE'
          and a.status in ('OPEN', 'ACKNOWLEDGED')
          and a.created_at > now() - interval '6 hours'
        limit 1;
      if not found then
        insert into public.alerts (organization_id, device_id, vehicle_id, type, severity, message)
        values (v_org.org_id, null, null, 'PIPELINE', 'critical',
                'Telemetry pipeline: no data received in the last 15 minutes. Collector or ingest may be down.');
        v_alerts_raised := v_alerts_raised + 1;
      end if;
    end if;
  end loop;

  -- Self-cleaning: keep 90 days of snapshots (288/day/org max)
  delete from public.pipeline_health where recorded_at < now() - interval '90 days';

  return jsonb_build_object('snapshots', v_snapshots, 'alerts_raised', v_alerts_raised);
end;
$$;

revoke all on function public.check_pipeline_health(boolean) from public, anon, authenticated;
grant execute on function public.check_pipeline_health(boolean) to service_role;
create or replace function public.export_organization_data(
  p_organization_id uuid,
  p_from timestamptz default now() - interval '180 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  v_request_id uuid;
  v_org jsonb;
  v_payload jsonb;
begin
  if not public.has_org_role(p_organization_id, array['SUPER_ADMIN','ORGANIZATION_ADMIN']) then
    raise exception 'Not authorized';
  end if;
  if p_from >= p_to then
    raise exception 'Invalid export time range';
  end if;

  insert into public.privacy_requests (organization_id, requested_by, request_type, status, metadata, completed_at)
  values (p_organization_id, auth.uid(), 'EXPORT', 'PENDING',
          jsonb_build_object('from', p_from, 'to', p_to), null)
  returning id into v_request_id;

  select to_jsonb(o) into v_org
  from public.organizations o where o.id = p_organization_id;

  v_payload := jsonb_build_object(
    'export_version', '1.0',
    'generated_at', now(),
    'time_range', jsonb_build_object('from', p_from, 'to', p_to),
    'organization', v_org,
    'profiles', coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p where p.id in (select ur.user_id from public.user_roles ur where ur.organization_id = p_organization_id)), '[]'::jsonb),
    'user_roles', coalesce((select jsonb_agg(to_jsonb(ur)) from public.user_roles ur where ur.organization_id = p_organization_id), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(to_jsonb(b)) from public.branches b where b.organization_id = p_organization_id), '[]'::jsonb),
    'fleets', coalesce((select jsonb_agg(to_jsonb(f)) from public.fleets f where f.organization_id = p_organization_id), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(to_jsonb(v)) from public.vehicles v where v.organization_id = p_organization_id), '[]'::jsonb),
    'gps_devices', coalesce((select jsonb_agg(to_jsonb(gd)) from public.gps_devices gd where gd.organization_id = p_organization_id), '[]'::jsonb),
    'device_assignments', coalesce((select jsonb_agg(to_jsonb(da)) from public.device_assignments da where da.organization_id = p_organization_id), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(to_jsonb(d)) from public.drivers d where d.organization_id = p_organization_id), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(to_jsonb(t)) from public.trips t where t.organization_id = p_organization_id and t.start_time between p_from and p_to), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(a)) from public.alerts a where a.organization_id = p_organization_id and a.created_at between p_from and p_to), '[]'::jsonb),
    'device_events', coalesce((select jsonb_agg(to_jsonb(e)) from public.device_events e where e.organization_id = p_organization_id and e.created_at between p_from and p_to), '[]'::jsonb),
    'positions', coalesce((select jsonb_agg(to_jsonb(pos)) from public.positions pos where pos.organization_id = p_organization_id and pos.recorded_at between p_from and p_to), '[]'::jsonb),
    'maintenance_schedules', coalesce((select jsonb_agg(to_jsonb(ms)) from public.maintenance_schedules ms where ms.organization_id = p_organization_id), '[]'::jsonb),
    'audit_logs', coalesce((select jsonb_agg(to_jsonb(al)) from public.audit_logs al where al.organization_id = p_organization_id and al.created_at between p_from and p_to), '[]'::jsonb)
  );

  update public.privacy_requests
  set status = 'COMPLETED', completed_at = now(), metadata = metadata || jsonb_build_object('record_counts', jsonb_build_object(
    'positions', jsonb_array_length(v_payload->'positions'),
    'device_events', jsonb_array_length(v_payload->'device_events'),
    'alerts', jsonb_array_length(v_payload->'alerts')
  ))
  where id = v_request_id;

  return jsonb_build_object('request_id', v_request_id, 'data', v_payload);
exception when others then
  if v_request_id is not null then
    update public.privacy_requests set status = 'FAILED', completed_at = now(), metadata = metadata || jsonb_build_object('error', SQLERRM) where id = v_request_id;
  end if;
  raise;
end;
$$;

revoke all on function public.export_organization_data(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.export_organization_data(uuid, timestamptz, timestamptz) to authenticated, service_role;
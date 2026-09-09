create or replace function public.organization_entitlements(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = 'public', 'pg_catalog'
as $$
declare
  v_plan text;
  v_limits jsonb;
  v_devices bigint;
  v_vehicles bigint;
  v_users bigint;
begin
  if not public.has_org_role(p_organization_id, array['SUPER_ADMIN','RESELLER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','VIEWER']) then
    raise exception 'Not authorized';
  end if;

  select upper(coalesce(o.plan, 'TRIAL')) into v_plan from public.organizations o where o.id = p_organization_id;
  if v_plan is null then raise exception 'Organization not found'; end if;

  v_limits := case v_plan
    when 'STARTER' then jsonb_build_object('devices', 100, 'vehicles', 100, 'users', 20, 'retention_days', 180)
    when 'PROFESSIONAL' then jsonb_build_object('devices', 1000, 'vehicles', 1000, 'users', 100, 'retention_days', 365)
    when 'ENTERPRISE' then jsonb_build_object('devices', 100000, 'vehicles', 100000, 'users', 1000, 'retention_days', 730)
    else jsonb_build_object('devices', 10, 'vehicles', 10, 'users', 5, 'retention_days', 90)
  end;

  select count(*) into v_devices from public.gps_devices where organization_id = p_organization_id;
  select count(*) into v_vehicles from public.vehicles where organization_id = p_organization_id;
  select count(*) into v_users from public.user_roles where organization_id = p_organization_id;

  return jsonb_build_object(
    'plan', v_plan,
    'limits', v_limits,
    'usage', jsonb_build_object('devices', v_devices, 'vehicles', v_vehicles, 'users', v_users),
    'available', jsonb_build_object(
      'devices', greatest(0, (v_limits->>'devices')::int - v_devices),
      'vehicles', greatest(0, (v_limits->>'vehicles')::int - v_vehicles),
      'users', greatest(0, (v_limits->>'users')::int - v_users)
    )
  );
end;
$$;

create or replace function public.organization_can_provision(
  p_organization_id uuid,
  p_resource text,
  p_quantity integer default 1
)
returns boolean
language plpgsql
security definer
stable
set search_path = 'public', 'pg_catalog'
as $$
declare
  v_entitlements jsonb;
  v_key text;
  v_current bigint;
  v_limit integer;
begin
  if p_quantity < 1 then return false; end if;
  if p_resource not in ('devices', 'vehicles', 'users') then return false; end if;
  v_entitlements := public.organization_entitlements(p_organization_id);
  v_key := p_resource;
  v_current := (v_entitlements->'usage'->>v_key)::bigint;
  v_limit := (v_entitlements->'limits'->>v_key)::integer;
  return v_current + p_quantity <= v_limit;
end;
$$;

revoke all on function public.organization_entitlements(uuid) from public, anon;
revoke all on function public.organization_can_provision(uuid, text, integer) from public, anon;
grant execute on function public.organization_entitlements(uuid) to authenticated, service_role;
grant execute on function public.organization_can_provision(uuid, text, integer) to authenticated, service_role;
create or replace function public.delete_organization_data(
  p_organization_id uuid,
  p_confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  v_request_id uuid;
  v_org_name text;
begin
  if not public.has_org_role(p_organization_id, array['SUPER_ADMIN','ORGANIZATION_ADMIN']) then
    raise exception 'Not authorized';
  end if;

  select name into v_org_name from public.organizations where id = p_organization_id for update;
  if v_org_name is null then
    raise exception 'Organization not found';
  end if;
  if p_confirmation is distinct from v_org_name then
    raise exception 'Confirmation does not match organization name';
  end if;

  insert into public.privacy_requests (organization_id, requested_by, request_type, status, metadata, completed_at)
  values (p_organization_id, auth.uid(), 'DELETE', 'PENDING', jsonb_build_object('organization_name', v_org_name), null)
  returning id into v_request_id;

  delete from public.organizations where id = p_organization_id;

  update public.privacy_requests
  set status = 'COMPLETED', completed_at = now(), metadata = metadata || jsonb_build_object('deleted', true)
  where id = v_request_id;

  return v_request_id;
exception when others then
  if v_request_id is not null then
    update public.privacy_requests set status = 'FAILED', completed_at = now(), metadata = metadata || jsonb_build_object('error', SQLERRM) where id = v_request_id;
  end if;
  raise;
end;
$$;

revoke all on function public.delete_organization_data(uuid, text) from public, anon;
grant execute on function public.delete_organization_data(uuid, text) to authenticated, service_role;
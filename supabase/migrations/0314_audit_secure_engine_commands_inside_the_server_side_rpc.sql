CREATE OR REPLACE FUNCTION public.request_engine_command(p_organization_id uuid, p_device_id uuid, p_vehicle_id uuid, p_command text, p_reason text)
RETURNS public.device_commands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_command public.device_commands;
  v_speed numeric;
  v_ignition boolean;
  v_recorded_at timestamptz;
BEGIN
  IF NOT public.has_org_role(p_organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']) THEN
    RAISE EXCEPTION 'Not authorized to request engine commands';
  END IF;
  IF p_command NOT IN ('ENGINE_CUT','ENGINE_RESUME') THEN
    RAISE EXCEPTION 'Unsupported engine command';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required';
  END IF;
  SELECT lp.speed, lp.ignition, lp.recorded_at
  INTO v_speed, v_ignition, v_recorded_at
  FROM public.latest_positions lp
  WHERE lp.organization_id = p_organization_id
    AND lp.device_id = p_device_id
    AND lp.vehicle_id = p_vehicle_id;
  IF p_command = 'ENGINE_CUT' THEN
    IF v_recorded_at IS NULL OR v_recorded_at < now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'Engine cut is blocked because telemetry is stale';
    END IF;
    IF coalesce(v_speed, 0) > 2 OR v_ignition IS TRUE THEN
      RAISE EXCEPTION 'Engine cut is blocked while the vehicle is moving or ignition is on';
    END IF;
  END IF;
  INSERT INTO public.device_commands (organization_id, device_id, vehicle_id, command, requested_by, reason)
  VALUES (p_organization_id, p_device_id, p_vehicle_id, p_command, auth.uid(), btrim(p_reason))
  RETURNING * INTO v_command;
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity, entity_id, new_data)
  VALUES (p_organization_id, auth.uid(), 'CREATE', 'device_command', v_command.id, jsonb_build_object('command', p_command, 'device_id', p_device_id, 'vehicle_id', p_vehicle_id, 'reason', btrim(p_reason)));
  RETURN v_command;
END;
$$
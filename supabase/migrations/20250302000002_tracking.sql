-- 1. Raw GPS positions (history)
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  speed numeric,            -- km/h
  course numeric,           -- degrees 0-360
  altitude numeric,         -- meters
  accuracy numeric,         -- meters
  address text,
  battery_level numeric,    -- 0-100
  ignition boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX positions_device_time_idx ON public.positions (device_id, recorded_at DESC);
CREATE INDEX positions_org_time_idx ON public.positions (organization_id, recorded_at DESC);
CREATE INDEX positions_vehicle_time_idx ON public.positions (vehicle_id, recorded_at DESC) WHERE vehicle_id IS NOT NULL;

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY positions_select ON public.positions
  FOR SELECT USING (organization_id IN (SELECT public.current_user_org_ids()));

GRANT SELECT ON public.positions TO authenticated;


-- 2. Latest position per device — the heartbeat of the live map
CREATE TABLE public.latest_positions (
  device_id uuid PRIMARY KEY REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  speed numeric,
  course numeric,
  altitude numeric,
  accuracy numeric,
  address text,
  battery_level numeric,
  ignition boolean,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX latest_positions_org_idx ON public.latest_positions (organization_id);

ALTER TABLE public.latest_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY latest_positions_select ON public.latest_positions
  FOR SELECT USING (organization_id IN (SELECT public.current_user_org_ids()));

GRANT SELECT ON public.latest_positions TO authenticated;


-- 3. Geofences (Phase 2: circles; polygons arrive in a later phase)
CREATE TABLE public.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  geometry jsonb NOT NULL,   -- {"type":"circle","coordinates":{"center":[lat,lng],"radius":meters}}
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX geofences_org_idx ON public.geofences (organization_id);

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY geofences_select ON public.geofences
  FOR SELECT USING (organization_id IN (SELECT public.current_user_org_ids()));

CREATE POLICY geofences_insert ON public.geofences
  FOR INSERT WITH CHECK (public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','DISPATCHER']));

CREATE POLICY geofences_update ON public.geofences
  FOR UPDATE USING (public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','DISPATCHER']));

CREATE POLICY geofences_delete ON public.geofences
  FOR DELETE USING (public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));

GRANT SELECT ON public.geofences TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.geofences TO authenticated;

CREATE TRIGGER trg_geofences_updated BEFORE UPDATE ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 4. Device events — ignition, movement, offline, overspeed
CREATE TABLE public.device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_events_org_time_idx ON public.device_events (organization_id, created_at DESC);
CREATE INDEX device_events_device_idx ON public.device_events (device_id, created_at DESC);

ALTER TABLE public.device_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_events_select ON public.device_events
  FOR SELECT USING (organization_id IN (SELECT public.current_user_org_ids()));

GRANT SELECT ON public.device_events TO authenticated;


-- 5. Enable realtime so the live map updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.latest_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_events;
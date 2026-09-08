CREATE TABLE public.asset_sensors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sensor_type TEXT NOT NULL DEFAULT 'TEMPERATURE' CHECK (sensor_type IN ('TEMPERATURE','HUMIDITY','DOOR','PANIC_BUTTON','CUSTOM')),
  unit TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX asset_sensors_org_idx ON public.asset_sensors USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asset_sensors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asset_sensors TO authenticated;

ALTER TABLE public.asset_sensors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_sensors_select" ON public.asset_sensors
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "asset_sensors_insert" ON public.asset_sensors
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "asset_sensors_update" ON public.asset_sensors
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "asset_sensors_delete" ON public.asset_sensors
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
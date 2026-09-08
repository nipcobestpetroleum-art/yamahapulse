CREATE TABLE public.fuel_sensors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  sensor_type TEXT NOT NULL DEFAULT 'CAPACITIVE' CHECK (sensor_type IN ('ANALOG','DIGITAL','CAPACITIVE','ULTRASONIC')),
  tank_capacity_liters NUMERIC(10,2),
  calibration_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX fuel_sensors_org_idx ON public.fuel_sensors USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_sensors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_sensors TO authenticated;

ALTER TABLE public.fuel_sensors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_sensors_select" ON public.fuel_sensors
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "fuel_sensors_insert" ON public.fuel_sensors
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "fuel_sensors_update" ON public.fuel_sensors
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "fuel_sensors_delete" ON public.fuel_sensors
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
CREATE TABLE public.sensor_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sensor_id UUID NOT NULL REFERENCES public.asset_sensors(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX sensor_readings_sensor_time_idx ON public.sensor_readings USING btree (sensor_id, recorded_at DESC);
CREATE INDEX sensor_readings_org_idx ON public.sensor_readings USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sensor_readings TO service_role;
GRANT SELECT, INSERT ON TABLE public.sensor_readings TO authenticated;

ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sensor_readings_select" ON public.sensor_readings
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "sensor_readings_insert" ON public.sensor_readings
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));
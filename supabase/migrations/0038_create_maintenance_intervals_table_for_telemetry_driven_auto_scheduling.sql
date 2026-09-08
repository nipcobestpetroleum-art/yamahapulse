CREATE TABLE public.maintenance_intervals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  interval_km NUMERIC(10,2),
  interval_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT maintenance_intervals_has_interval CHECK (interval_km IS NOT NULL OR interval_days IS NOT NULL)
);

CREATE INDEX maintenance_intervals_org_idx ON public.maintenance_intervals USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.maintenance_intervals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.maintenance_intervals TO authenticated;

ALTER TABLE public.maintenance_intervals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_intervals_select" ON public.maintenance_intervals
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "maintenance_intervals_insert" ON public.maintenance_intervals
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "maintenance_intervals_update" ON public.maintenance_intervals
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "maintenance_intervals_delete" ON public.maintenance_intervals
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
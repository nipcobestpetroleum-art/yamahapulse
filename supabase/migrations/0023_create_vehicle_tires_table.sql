CREATE TABLE public.vehicle_tires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN ('FRONT_LEFT','FRONT_RIGHT','REAR_LEFT','REAR_RIGHT','SPARE')),
  brand TEXT,
  size TEXT,
  installed_at DATE,
  tread_depth_mm NUMERIC(5,1),
  status TEXT NOT NULL DEFAULT 'GOOD' CHECK (status IN ('GOOD','WORN','NEEDS_REPLACEMENT')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX vehicle_tires_org_idx ON public.vehicle_tires USING btree (organization_id);
CREATE INDEX vehicle_tires_vehicle_idx ON public.vehicle_tires USING btree (vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_tires TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_tires TO authenticated;

ALTER TABLE public.vehicle_tires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_tires_select" ON public.vehicle_tires
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "vehicle_tires_insert" ON public.vehicle_tires
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "vehicle_tires_update" ON public.vehicle_tires
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "vehicle_tires_delete" ON public.vehicle_tires
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
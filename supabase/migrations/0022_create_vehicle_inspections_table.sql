CREATE TABLE public.vehicle_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  technician_id UUID,
  inspected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_status TEXT NOT NULL DEFAULT 'PASS' CHECK (overall_status IN ('PASS','FAIL','NEEDS_ATTENTION')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX vehicle_inspections_org_idx ON public.vehicle_inspections USING btree (organization_id, inspected_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_inspections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_inspections TO authenticated;

ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_inspections_select" ON public.vehicle_inspections
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "vehicle_inspections_insert" ON public.vehicle_inspections
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "vehicle_inspections_update" ON public.vehicle_inspections
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "vehicle_inspections_delete" ON public.vehicle_inspections
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
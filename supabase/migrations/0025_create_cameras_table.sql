CREATE TABLE public.cameras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'FRONT' CHECK (direction IN ('FRONT','DRIVER','CARGO','REAR','OTHER')),
  stream_url TEXT,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','OFFLINE')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX cameras_org_idx ON public.cameras USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cameras TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cameras TO authenticated;

ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cameras_select" ON public.cameras
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "cameras_insert" ON public.cameras
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "cameras_update" ON public.cameras
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "cameras_delete" ON public.cameras
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
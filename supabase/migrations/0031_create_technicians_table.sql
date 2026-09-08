CREATE TABLE public.technicians (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  specialty TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX technicians_org_idx ON public.technicians USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.technicians TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.technicians TO authenticated;

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technicians_select" ON public.technicians
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "technicians_insert" ON public.technicians
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER']));

CREATE POLICY "technicians_update" ON public.technicians
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER']));

CREATE POLICY "technicians_delete" ON public.technicians
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
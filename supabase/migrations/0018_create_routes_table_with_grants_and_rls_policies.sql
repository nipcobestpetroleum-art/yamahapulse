CREATE TABLE public.routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  distance_km NUMERIC(10,2),
  estimated_duration_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX routes_org_idx ON public.routes USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.routes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.routes TO authenticated;

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routes_select" ON public.routes
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "routes_insert" ON public.routes
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','DISPATCHER']));

CREATE POLICY "routes_update" ON public.routes
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','DISPATCHER']));

CREATE POLICY "routes_delete" ON public.routes
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
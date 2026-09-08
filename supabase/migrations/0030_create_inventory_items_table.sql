CREATE TABLE public.inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  reorder_level NUMERIC(10,2),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX inventory_items_org_idx ON public.inventory_items USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_items TO authenticated;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_items_select" ON public.inventory_items
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "inventory_items_insert" ON public.inventory_items
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "inventory_items_update" ON public.inventory_items
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "inventory_items_delete" ON public.inventory_items
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
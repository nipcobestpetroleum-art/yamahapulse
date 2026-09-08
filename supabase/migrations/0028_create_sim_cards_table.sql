CREATE TABLE public.sim_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  iccid TEXT NOT NULL,
  phone_number TEXT,
  carrier TEXT,
  plan_data_mb INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','INACTIVE')),
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX sim_cards_org_idx ON public.sim_cards USING btree (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sim_cards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sim_cards TO authenticated;

ALTER TABLE public.sim_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim_cards_select" ON public.sim_cards
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "sim_cards_insert" ON public.sim_cards
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "sim_cards_update" ON public.sim_cards
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "sim_cards_delete" ON public.sim_cards
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
CREATE TABLE public.fuel_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  sensor_id UUID REFERENCES public.fuel_sensors(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'REFUEL' CHECK (type IN ('REFUEL','DRAIN','THEFT')),
  liters NUMERIC(10,2) NOT NULL,
  cost NUMERIC(12,2),
  odometer NUMERIC(10,1),
  location TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notes TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX fuel_transactions_org_time_idx ON public.fuel_transactions USING btree (organization_id, recorded_at DESC);
CREATE INDEX fuel_transactions_vehicle_idx ON public.fuel_transactions USING btree (vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_transactions TO authenticated;

ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_transactions_select" ON public.fuel_transactions
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "fuel_transactions_insert" ON public.fuel_transactions
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','DISPATCHER','TECHNICIAN']));

CREATE POLICY "fuel_transactions_update" ON public.fuel_transactions
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','DISPATCHER','TECHNICIAN']));

CREATE POLICY "fuel_transactions_delete" ON public.fuel_transactions
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
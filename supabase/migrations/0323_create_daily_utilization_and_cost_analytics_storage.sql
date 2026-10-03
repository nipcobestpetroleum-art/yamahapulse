CREATE TABLE IF NOT EXISTS public.asset_utilization_daily (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  day date NOT NULL,
  distance_km numeric(12,2) NOT NULL DEFAULT 0,
  driving_minutes numeric(12,2) NOT NULL DEFAULT 0,
  trip_count integer NOT NULL DEFAULT 0,
  stop_count integer NOT NULL DEFAULT 0,
  fuel_cost numeric(14,2) NOT NULL DEFAULT 0,
  maintenance_cost numeric(14,2) NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, vehicle_id, day)
);
ALTER TABLE public.asset_utilization_daily ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.asset_utilization_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_utilization_daily TO service_role;
CREATE POLICY asset_utilization_daily_select ON public.asset_utilization_daily FOR SELECT TO authenticated USING (public.user_can_access_asset(organization_id, NULL::uuid, vehicle_id));
CREATE INDEX asset_utilization_daily_org_day_idx ON public.asset_utilization_daily (organization_id, day DESC);
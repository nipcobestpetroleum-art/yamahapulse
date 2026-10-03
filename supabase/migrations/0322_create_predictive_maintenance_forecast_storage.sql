CREATE TABLE IF NOT EXISTS public.asset_maintenance_forecasts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  forecast_type text NOT NULL CHECK (forecast_type IN ('SERVICE_DUE','BATTERY_RISK','TIRE_RISK','DEVICE_RISK')),
  predicted_date date,
  confidence numeric(5,2) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  rationale text NOT NULL,
  source_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vehicle_id, forecast_type)
);
ALTER TABLE public.asset_maintenance_forecasts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.asset_maintenance_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_maintenance_forecasts TO service_role;
CREATE POLICY asset_maintenance_forecasts_select ON public.asset_maintenance_forecasts FOR SELECT TO authenticated USING (public.user_can_access_asset(organization_id, NULL::uuid, vehicle_id));
CREATE INDEX asset_maintenance_forecasts_org_status_idx ON public.asset_maintenance_forecasts (organization_id, status, calculated_at DESC);
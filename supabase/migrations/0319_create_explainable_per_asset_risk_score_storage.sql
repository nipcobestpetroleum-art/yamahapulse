CREATE TABLE IF NOT EXISTS public.asset_risk_scores (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  level text NOT NULL DEFAULT 'LOW' CHECK (level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(5,2) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, vehicle_id)
);
ALTER TABLE public.asset_risk_scores ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.asset_risk_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_risk_scores TO service_role;
CREATE POLICY asset_risk_scores_select ON public.asset_risk_scores FOR SELECT TO authenticated USING (public.user_can_access_asset(organization_id, device_id, vehicle_id));
CREATE INDEX asset_risk_scores_org_level_idx ON public.asset_risk_scores (organization_id, level, calculated_at DESC);
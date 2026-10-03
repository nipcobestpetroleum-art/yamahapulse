CREATE TABLE IF NOT EXISTS public.monitoring_incidents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  incident_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','FALSE_POSITIVE')),
  title text NOT NULL,
  summary text NOT NULL,
  confidence numeric(5,2) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.monitoring_incidents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.monitoring_incidents TO authenticated;
GRANT UPDATE ON public.monitoring_incidents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_incidents TO service_role;
CREATE POLICY monitoring_incidents_select ON public.monitoring_incidents FOR SELECT TO authenticated USING (public.user_can_access_asset(organization_id, device_id, vehicle_id));
CREATE POLICY monitoring_incidents_update ON public.monitoring_incidents FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER','DISPATCHER'])) WITH CHECK (public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER','DISPATCHER']));
CREATE INDEX monitoring_incidents_asset_time_idx ON public.monitoring_incidents (organization_id, device_id, last_event_at DESC);
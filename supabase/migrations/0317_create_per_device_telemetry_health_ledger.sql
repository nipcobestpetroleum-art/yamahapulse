CREATE TABLE IF NOT EXISTS public.telemetry_ingest_health (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  last_received_at timestamptz,
  last_recorded_at timestamptz,
  last_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (last_status IN ('HEALTHY','DELAYED','STALE','INVALID','UNKNOWN')),
  packet_count bigint NOT NULL DEFAULT 0,
  rejected_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, device_id)
);
ALTER TABLE public.telemetry_ingest_health ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.telemetry_ingest_health TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemetry_ingest_health TO service_role;
CREATE POLICY telemetry_ingest_health_select ON public.telemetry_ingest_health FOR SELECT TO authenticated USING (public.user_can_access_asset(organization_id, device_id, NULL::uuid));
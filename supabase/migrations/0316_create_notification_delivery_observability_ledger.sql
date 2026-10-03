CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','SMS','PUSH','WEBHOOK')),
  notification_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','RATE_LIMITED','SUPPRESSED')),
  provider_status integer,
  provider_message text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.notification_delivery_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_delivery_logs TO service_role;
CREATE POLICY notification_delivery_logs_select ON public.notification_delivery_logs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN']));
CREATE INDEX notification_delivery_logs_org_created_idx ON public.notification_delivery_logs (organization_id, created_at DESC);
CREATE INDEX notification_delivery_logs_device_created_idx ON public.notification_delivery_logs (device_id, created_at DESC);
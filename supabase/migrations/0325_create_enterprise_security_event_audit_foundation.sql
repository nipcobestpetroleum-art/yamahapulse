CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.security_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_events TO service_role;
CREATE POLICY security_events_select ON public.security_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN']));
CREATE INDEX security_events_org_time_idx ON public.security_events (organization_id, created_at DESC);
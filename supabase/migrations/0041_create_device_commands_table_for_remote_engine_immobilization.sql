CREATE TABLE public.device_commands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  command TEXT NOT NULL CHECK (command IN ('ENGINE_CUT', 'ENGINE_RESUME')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_commands TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.device_commands TO authenticated;

ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_commands_select" ON public.device_commands
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "device_commands_insert" ON public.device_commands
FOR INSERT TO authenticated WITH CHECK (
  has_org_role(organization_id, ARRAY['SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'FLEET_MANAGER'])
);

CREATE POLICY "device_commands_update" ON public.device_commands
FOR UPDATE TO authenticated USING (
  has_org_role(organization_id, ARRAY['SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'FLEET_MANAGER'])
);

CREATE INDEX device_commands_device_idx ON public.device_commands (device_id, status);
CREATE INDEX device_commands_org_idx ON public.device_commands (organization_id, requested_at DESC);
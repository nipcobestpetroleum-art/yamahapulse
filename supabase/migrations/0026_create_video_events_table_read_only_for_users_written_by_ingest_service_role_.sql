CREATE TABLE public.video_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES public.cameras(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'DRIVING' CHECK (category IN ('DRIVING','AI_SAFETY')),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  clip_url TEXT,
  message TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX video_events_org_time_idx ON public.video_events USING btree (organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_events TO authenticated;

ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_events_select" ON public.video_events
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "video_events_update" ON public.video_events
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER']));

CREATE POLICY "video_events_delete" ON public.video_events
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
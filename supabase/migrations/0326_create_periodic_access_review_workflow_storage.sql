CREATE TABLE IF NOT EXISTS public.access_review_cycles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','OVERDUE')),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.access_review_cycles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.access_review_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_review_cycles TO service_role;
CREATE POLICY access_review_cycles_select ON public.access_review_cycles FOR SELECT TO authenticated USING (reviewer_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN']));
CREATE POLICY access_review_cycles_update ON public.access_review_cycles FOR UPDATE TO authenticated USING (reviewer_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN'])) WITH CHECK (reviewer_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN']));
CREATE INDEX access_review_cycles_org_status_idx ON public.access_review_cycles (organization_id, status, due_at);
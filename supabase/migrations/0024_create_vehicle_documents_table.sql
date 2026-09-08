CREATE TABLE public.vehicle_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'OTHER' CHECK (doc_type IN ('INSURANCE','REGISTRATION','PERMIT','INSPECTION_CERTIFICATE','OTHER')),
  title TEXT NOT NULL,
  file_url TEXT,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX vehicle_documents_org_idx ON public.vehicle_documents USING btree (organization_id);
CREATE INDEX vehicle_documents_vehicle_idx ON public.vehicle_documents USING btree (vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_documents TO authenticated;

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_documents_select" ON public.vehicle_documents
FOR SELECT TO authenticated USING (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "vehicle_documents_insert" ON public.vehicle_documents
FOR INSERT TO authenticated WITH CHECK (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "vehicle_documents_update" ON public.vehicle_documents
FOR UPDATE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','BRANCH_MANAGER','FLEET_MANAGER','TECHNICIAN']));

CREATE POLICY "vehicle_documents_delete" ON public.vehicle_documents
FOR DELETE TO authenticated USING (has_org_role(organization_id, ARRAY['SUPER_ADMIN','ORGANIZATION_ADMIN','FLEET_MANAGER']));
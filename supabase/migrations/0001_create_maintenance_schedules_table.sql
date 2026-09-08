CREATE TABLE public.maintenance_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  due_date date,
  due_odometer numeric(12,2),
  status text NOT NULL DEFAULT 'SCHEDULED',
  completed_at timestamptz,
  cost numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
ALTER TABLE public.maintenance_schedules
  ADD COLUMN auto_generated boolean NOT NULL DEFAULT false;
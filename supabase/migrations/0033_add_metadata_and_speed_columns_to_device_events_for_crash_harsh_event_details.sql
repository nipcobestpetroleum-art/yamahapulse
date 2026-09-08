ALTER TABLE public.device_events
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN speed numeric;
ALTER TABLE public.asset_sensors
  ADD COLUMN last_value numeric,
  ADD COLUMN last_reading_at timestamp with time zone;
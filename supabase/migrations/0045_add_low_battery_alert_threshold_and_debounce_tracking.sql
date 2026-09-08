ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS battery_threshold numeric;
ALTER TABLE public.latest_positions ADD COLUMN IF NOT EXISTS low_battery_alerted boolean NOT NULL DEFAULT false;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS external_power boolean;
ALTER TABLE public.latest_positions ADD COLUMN IF NOT EXISTS external_power boolean;
ALTER TABLE public.latest_positions ADD COLUMN IF NOT EXISTS idle_since timestamp with time zone;
ALTER TABLE public.latest_positions ADD COLUMN IF NOT EXISTS idle_alerted boolean NOT NULL DEFAULT false;
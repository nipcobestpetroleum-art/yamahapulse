ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS door_open boolean;
ALTER TABLE public.latest_positions ADD COLUMN IF NOT EXISTS door_open boolean;
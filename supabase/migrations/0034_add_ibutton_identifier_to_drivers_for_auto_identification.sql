ALTER TABLE public.drivers
  ADD COLUMN ibutton_id text;

CREATE UNIQUE INDEX drivers_ibutton_unique ON public.drivers (organization_id, ibutton_id) WHERE (ibutton_id IS NOT NULL);
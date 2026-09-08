ALTER TABLE public.vehicle_inspections
  ADD CONSTRAINT vehicle_inspections_technician_id_fkey
  FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;
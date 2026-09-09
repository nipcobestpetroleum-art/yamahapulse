select cron.schedule(
  'telemetry-partition-maintenance',
  '30 3 * * *',
  $$select public.maintain_telemetry_partitions()$$
) as job_id;
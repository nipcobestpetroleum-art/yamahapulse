select cron.schedule(
  'pipeline-health-monitor',
  '*/5 * * * *',
  $$select public.check_pipeline_health()$$
) as job_id;
REVOKE ALL ON TABLE public.notification_delivery_logs, public.telemetry_ingest_health FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.notification_delivery_logs, public.telemetry_ingest_health FROM authenticated;
GRANT SELECT ON TABLE public.notification_delivery_logs, public.telemetry_ingest_health TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_delivery_logs, public.telemetry_ingest_health TO service_role;
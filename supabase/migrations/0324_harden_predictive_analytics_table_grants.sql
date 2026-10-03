REVOKE ALL ON TABLE public.asset_maintenance_forecasts, public.asset_utilization_daily FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.asset_maintenance_forecasts, public.asset_utilization_daily FROM authenticated;
GRANT SELECT ON TABLE public.asset_maintenance_forecasts, public.asset_utilization_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asset_maintenance_forecasts, public.asset_utilization_daily TO service_role;
REVOKE ALL ON TABLE public.asset_risk_scores, public.monitoring_incidents FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.asset_risk_scores, public.monitoring_incidents FROM authenticated;
GRANT SELECT ON TABLE public.asset_risk_scores TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.monitoring_incidents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asset_risk_scores, public.monitoring_incidents TO service_role;
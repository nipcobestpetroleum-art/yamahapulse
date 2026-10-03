REVOKE ALL ON TABLE public.security_events, public.access_review_cycles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.security_events FROM authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.access_review_cycles FROM authenticated;
GRANT SELECT ON public.security_events TO authenticated;
GRANT SELECT, UPDATE ON public.access_review_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_events, public.access_review_cycles TO service_role;
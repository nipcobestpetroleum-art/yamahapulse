REVOKE REFERENCES, TRIGGER ON TABLE public.security_events, public.access_review_cycles FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.access_review_cycles TO authenticated;
GRANT SELECT ON TABLE public.security_events TO authenticated;
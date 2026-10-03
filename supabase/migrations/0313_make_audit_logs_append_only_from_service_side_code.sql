REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM authenticated;
DROP POLICY "audit_logs_insert" ON public.audit_logs;
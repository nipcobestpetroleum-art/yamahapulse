REVOKE ALL ON FUNCTION public.request_engine_command(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_engine_command(uuid, uuid, uuid, text, text) TO authenticated, service_role;
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='device_commands' ORDER BY policyname;
SELECT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT,UPDATE,DELETE') AS authenticated_can_mutate_audit_logs;
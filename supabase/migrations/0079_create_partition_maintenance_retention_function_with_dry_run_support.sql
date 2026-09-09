create or replace function public.maintain_telemetry_partitions(
  p_retention_positions_days int default 180,
  p_retention_events_days int default 730,
  p_dry_run boolean default false
)
returns table(action text, object text)
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  cfg record;
  v_i int;
  v_month date;
  v_name text;
  v_start timestamptz;
  v_end timestamptz;
  v_boundary timestamptz;
  v_retention interval;
begin
  -- Partition maintenance for telemetry tables (positions, device_events):
  --  1. Pre-create the current and next month's partitions so inserts never fail.
  --  2. Drop whole monthly partitions whose end boundary is older than the
  --     retention window (cheap metadata operation — no per-row deletes).
  for cfg in
    select * from (values
      ('positions', 'positions_', p_retention_positions_days),
      ('device_events', 'device_events_', p_retention_events_days)
    ) as c(tab, prefix, retention_days)
  loop
    -- 1) Pre-create current + next month
    for v_i in 0..1 loop
      v_month := date_trunc('month', (now() at time zone 'utc')::date)::date + make_interval(months => v_i);
      v_name := cfg.prefix || to_char(v_month, 'YYYYMM');
      if to_regclass('public.' || v_name) is null then
        v_start := v_month::timestamp at time zone 'utc';
        v_end := (v_month + interval '1 month')::date::timestamp at time zone 'utc';
        if p_dry_run then
          action := 'would_create'; object := v_name; return next;
        else
          execute format(
            'create table public.%I partition of public.%I for values from (%L) to (%L)',
            v_name, cfg.tab, v_start, v_end
          );
          execute format('grant select, insert, update, delete on public.%I to service_role', v_name);
          execute format('grant select on public.%I to authenticated', v_name);
          action := 'created'; object := v_name; return next;
        end if;
      end if;
    end loop;

    -- 2) Drop expired monthly partitions
    v_retention := make_interval(days => cfg.retention_days);
    for v_name in
      select c.relname
      from pg_inherits i
      join pg_class p on p.oid = i.inhparent
      join pg_namespace pn on pn.oid = p.relnamespace
      join pg_class c on c.oid = i.inhrelid
      where p.relname = cfg.tab
        and pn.nspname = 'public'
        and c.relname ~ (cfg.prefix || '[0-9]{6}$')
    loop
      v_month := to_date(substring(v_name from '[0-9]{6}$'), 'YYYYMM');
      v_boundary := (v_month + interval '1 month')::date::timestamp at time zone 'utc';
      if v_boundary < now() - v_retention then
        if p_dry_run then
          action := 'would_drop'; object := v_name; return next;
        else
          execute format('drop table public.%I', v_name);
          action := 'dropped'; object := v_name; return next;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.maintain_telemetry_partitions(int, int, boolean) from public, anon, authenticated;
grant execute on function public.maintain_telemetry_partitions(int, int, boolean) to service_role;
-- A SQL function's body is checked when it is created, and never again: a
-- later migration can drop or change what it calls and nothing notices
-- until somebody's page fails (0177 → 0180). Re-create every one, in a
-- transaction that is rolled back, so each body is checked against the
-- schema as it now is.
begin;
set local check_function_bodies = on;
do $check$
declare f record; bad text := '';
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_language l on l.oid = p.prolang
    where p.pronamespace = 'public'::regnamespace and l.lanname = 'sql' and p.prokind = 'f'
  loop
    begin
      execute pg_get_functiondef(f.oid);
    exception when others then
      bad := bad || format(E'\n  %s: %s', f.proname, sqlerrm);
    end;
  end loop;
  if bad <> '' then
    raise exception 'SQL functions that no longer match the schema:%', bad;
  end if;
end
$check$;
rollback;

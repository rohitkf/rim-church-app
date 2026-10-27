/*
 * Prayer Requests and Clock In change on screen as they change in the
 * database (lib/useLiveData.ts, 0168).
 *
 * Clock In's tables are readable row by row (0191-0194), so they join the
 * publication like every other live table: Realtime passes each change on
 * to whoever its policies let read the row, and the page refetches.
 *
 * Prayer's cannot be. Its tables are read only through prayer_board()
 * (0197), because an anonymous request's author has to be kept from the
 * people it is shown to, and Realtime checks the table's own policies —
 * which let nobody read anything. So the database says only that
 * something changed: a broadcast with nothing in it, on a private topic
 * that only somebody signed in may listen to. Each open Prayer page then
 * asks prayer_board() again, which answers with what that person may see.
 * One message per statement, not per row.
 *
 * Guarded: CI's bare Postgres has neither the publication nor Realtime.
 */

-- ---------------------------------------------------------------------------
-- Clock In: into the publication
-- ---------------------------------------------------------------------------

do $pub$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['clock_ins', 'clock_in_history', 'clock_in_requests', 'clock_in_place'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $pub$;

-- ---------------------------------------------------------------------------
-- Prayer: "something changed", and nothing more
-- ---------------------------------------------------------------------------

create or replace function public.prayer_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Realtime is not in every database this runs in; a write must never
  -- fail for want of telling the screens.
  begin
    perform realtime.send('{}'::jsonb, 'changed', 'prayer', true);
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function public.prayer_changed() from public, anon, authenticated;

do $live$
declare
  t text;
begin
  foreach t in array array[
    'prayer_requests', 'prayer_responses', 'prayer_updates',
    'prayer_assignments', 'prayer_lists', 'prayer_list_items'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_live', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each statement execute function public.prayer_changed()',
      t || '_live', t
    );
  end loop;
end $live$;

-- Who may listen: anybody signed in, to the prayer topic alone.
do $listen$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;
  drop policy if exists prayer_listens on realtime.messages;
  create policy prayer_listens on realtime.messages
    for select to authenticated
    using (realtime.topic() = 'prayer' and realtime.messages.extension = 'broadcast');
end $listen$;

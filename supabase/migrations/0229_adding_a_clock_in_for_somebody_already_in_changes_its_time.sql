-- Adding a clock-in for somebody already clocked in changes its time.
--
-- "Add a clock-in" refused anybody already in that day — "change its time
-- instead" — and the Owner, with the person picked and the time and the
-- reason typed, had to go and find their row and start again. Now the
-- same Add moves the time on the clock-in they already have, with the
-- reason, and the history says "time changed", from what to what and by
-- whom, as a Fix does. Nothing else about the clock-in changes: how it was
-- made (phone, request, added) is still what it was.

create or replace function public.clock_in_add(person uuid, at timestamptz, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  day date;
  made uuid;
  already public.clock_ins%rowtype;
begin
  if not public.clock_in_admin(auth.uid()) then
    raise exception 'Only the Owner or an Admin can add a clock-in.' using errcode = '42501';
  end if;
  if at is null then raise exception 'Give the time they arrived.'; end if;
  if at > now() + interval '5 minutes' then raise exception 'That time has not happened yet.'; end if;
  if not exists (select 1 from public.profiles where id = person) then raise exception 'Nobody by that name.'; end if;
  day := (at at time zone public.church_timezone())::date;

  select * into already from public.clock_ins where user_id = person and on_date = day;
  if found then
    if date_trunc('minute', already.clocked_at) = date_trunc('minute', at) then
      raise exception 'That is already their time.';
    end if;
    perform set_config('rim.clock_in_note', left(nullif(btrim(coalesce(note, '')), ''), 500), true);
    update public.clock_ins set clocked_at = at where id = already.id;
    perform set_config('rim.clock_in_note', '', true);
    return already.id;
  end if;

  perform set_config('rim.clock_in_note', left(nullif(btrim(coalesce(note, '')), ''), 500), true);
  insert into public.clock_ins (user_id, on_date, clocked_at, method, created_by)
  values (person, day, at, 'added', auth.uid())
  returning id into made;
  perform set_config('rim.clock_in_note', '', true);
  perform public.clock_in_mark_present(person, day);
  return made;
end;
$$;

revoke all on function public.clock_in_add(uuid, timestamptz, text) from public, anon;
grant execute on function public.clock_in_add(uuid, timestamptz, text) to authenticated;

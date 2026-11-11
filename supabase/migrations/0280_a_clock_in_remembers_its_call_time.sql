/*
 * A clock-in remembers its call time.
 *
 * The Owner asked three things of the Clock In page (November 2026): keep
 * the past four weeks of clock-ins and show, person by person, how their
 * arrival has gone over that time; show a clock-in "30 mins after the call
 * time" in red, at the top of the list; and put who is still to arrive
 * above the list instead of below it.
 *
 * Two of the three need to know, for a clock-in, what time that person was
 * called for. Until now nothing kept it. A person's call is worked out
 * when it is asked for, from that day's rota and that day's call times
 * (clock_in_first_call, 0192) — and services are deleted a couple of
 * weeks after they are held, the rota with them, so three weeks on the
 * question has no answer. A clock-in from the start of the month would
 * have a time and nothing to hold it against.
 *
 * So the clock-in keeps it: call_at, the person's first call that day as
 * it stood when they clocked in. It is stamped by a trigger, so every way
 * a clock-in comes to be — the button, an approved request, an Admin
 * adding one — is covered without each of them being taught. And it is
 * kept right while the day is still live: a Head who moves the team's
 * call time at eight that morning moves it for the people already in.
 * Past days are never restamped. Their call times are history, and the
 * rows they were worked out from are being cleared away behind them; a
 * clock-in that was on time on the day must not turn late a fortnight on
 * because the 08:30 it was held against has gone and 07:00 is the
 * default.
 *
 * Null is "not known" — somebody added for a day whose services have
 * already gone, somebody on no rota. Not known is never late.
 *
 * Two settings ride along, both the Clock in room's by their names (0277):
 *
 *   clock_in_late_minutes     how long after the call counts as late. 30,
 *                             as the Owner said it.
 *   clock_in_retention_days   was 30 out of the box; four weeks is 28, so
 *                             that is the default now, and a church still
 *                             on the old default moves with it. It is the
 *                             window the page shows, because it is what
 *                             is kept: delete_old_clock_ins (0191) clears
 *                             everything older every night, as it has.
 */

-- ---------------------------------------------------------------------------
-- The call time, kept on the clock-in
-- ---------------------------------------------------------------------------

alter table public.clock_ins add column call_at timestamptz;

comment on column public.clock_ins.call_at is
  'The person''s first call that day, as it stood when they clocked in (0280). Null when it could not be known. Kept current while the day is live; never restamped afterwards.';

-- Every clock-in there is: all of them are recent enough for their day's
-- rota to be there still. No history is written — only a changed
-- clocked_at is a change worth a line (clock_in_history_from_row).
update public.clock_ins c
   set call_at = public.clock_in_first_call(c.user_id, c.on_date)
 where c.call_at is null;

create or replace function public.clock_in_stamp_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.call_at is null then
    new.call_at := public.clock_in_first_call(new.user_id, new.on_date);
  end if;
  return new;
end;
$$;

revoke all on function public.clock_in_stamp_call() from public, anon, authenticated;

create trigger clock_ins_stamp_call
  before insert on public.clock_ins
  for each row execute function public.clock_in_stamp_call();

/*
 * A team's call time moved, for today or a day to come: the people
 * already clocked in that day are held against the new one. A day that
 * has passed is left alone, whatever happens to its call times.
 *
 * Only ever to a time that can be worked out. If the question has no
 * answer any more the stamp stays as it was.
 */
create or replace function public.clock_in_restamp_calls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone public.church_timezone())::date;
  days date[] := '{}';
  d date;
begin
  if tg_op <> 'INSERT' then days := days || old.on_date; end if;
  if tg_op <> 'DELETE' then days := days || new.on_date; end if;

  foreach d in array days loop
    if d < today then
      continue;
    end if;
    update public.clock_ins c
       set call_at = f.first_call
      from (
        select c2.id, public.clock_in_first_call(c2.user_id, c2.on_date) as first_call
          from public.clock_ins c2
         where c2.on_date = d
      ) f
     where c.id = f.id
       and f.first_call is not null
       and c.call_at is distinct from f.first_call;
  end loop;
  return null;
end;
$$;

revoke all on function public.clock_in_restamp_calls() from public, anon, authenticated;

create trigger department_call_times_restamp_clock_ins
  after insert or update or delete on public.department_call_times
  for each row execute function public.clock_in_restamp_calls();

-- ---------------------------------------------------------------------------
-- The two settings
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column clock_in_late_minutes integer not null default 30
    check (clock_in_late_minutes between 1 and 240);

comment on column public.app_settings.clock_in_late_minutes is
  'A clock-in this many minutes or more after the person''s call time is late: red, and at the top of the day''s list (0280).';

-- Four weeks. A church that never moved the dial moves with the default;
-- one that chose a number keeps it.
alter table public.app_settings alter column clock_in_retention_days set default 28;
update public.app_settings set clock_in_retention_days = 28 where clock_in_retention_days = 30;

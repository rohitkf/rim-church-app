/*
 * 0292 — A service can be marked not ended
 *
 * Every session but the last is held on by the one after it: "Not started"
 * on the next session (held_at, 0057) says the one before it is still
 * going, and its overrun counts until the next one starts. The last
 * session has nothing after it. Past its planned end the running order
 * simply read as finished, the rail's clock stopped, and how far over the
 * closing session ran was only known afterwards, if somebody pressed End
 * service inside the hour.
 *
 * So the service gets a hold of its own. `end_held_at` is when somebody
 * said "Not ended": while it is set and the end has not been called, the
 * Service Planner keeps the last session on past its time and counts its
 * overrun, and the Countdown page says the service has not ended. End
 * service clears it and records the real end, which is what gives the
 * closing session its over (lib/serviceProgress, runVariance).
 *
 * It is a mark for the people running the service, and changes no rule:
 * when a service counts as ended for checklists, issues, debriefs and the
 * editing lock is still service_ended_at() and service_has_finished() —
 * the planned end until End service is pressed, the real one after.
 *
 * Whoever may end the service may hold its end: it is the same button's
 * other half, so the guard that keeps the End button to `ended_at` lets it
 * write this column too, and nothing else.
 */

alter table public.services
  add column if not exists end_held_at timestamptz;

comment on column public.services.end_held_at is
  'When somebody said the service had not ended: the last session stays on past its time and its overrun counts until End service (0292). Cleared when the end is called.';

create or replace function public.planner_controls_guard_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1
     or auth.uid() is null
     or public.may(auth.uid(), 'svc.manage') then
    return new;
  end if;
  if (to_jsonb(new) - 'ended_at' - 'end_held_at') is distinct from (to_jsonb(old) - 'ended_at' - 'end_held_at') then
    raise exception 'Only ending or reopening the service is one of the planner buttons you have been given.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.planner_controls_guard_service() from public, anon, authenticated;
select public.migration_done(292, '0292_a_service_can_be_marked_not_ended', '4af9a39712e59a71428e6988595159aa77f3c14e06a751536fce7739166af888');

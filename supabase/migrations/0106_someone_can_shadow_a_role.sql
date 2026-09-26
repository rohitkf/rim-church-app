/*
 * Someone can shadow a role.
 *
 * A new volunteer learns a job by standing next to the person doing it.
 * The rota had no way to say so: putting them down as "Camera Operator 1"
 * said they were running the camera, and leaving them off said they were
 * not there at all.
 *
 * So an assignment can be marked as a shadow. It is still an ordinary
 * assignment — the person is at that service, on that team, learning that
 * role, so it is still their one role there (Team Coordinator excepted,
 * exactly as before). It just says they are watching rather than doing.
 *
 * Nothing to backfill: every assignment made so far was the real thing.
 */

alter table public.rota_assignments
  add column if not exists is_shadow boolean not null default false;

-- The activity feed says which it was, so "Joel assigned" on a role
-- somebody else is already doing does not read as a double booking.
create or replace function public.activity_from_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  who text;
begin
  if tg_op = 'DELETE' then
    select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
      into who from public.profiles where id = old.user_id;
    perform public.record_activity(
      old.service_id, old.department_id, auth.uid(), 'rota',
      old.role_label, coalesce(nullif(who, ''), 'someone') || ' taken off'
    );
    return old;
  end if;

  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into who from public.profiles where id = new.user_id;
  perform public.record_activity(
    new.service_id, new.department_id, auth.uid(), 'rota',
    new.role_label,
    coalesce(nullif(who, ''), 'someone')
      || case when new.is_shadow then ' assigned to shadow' else ' assigned' end
  );
  return new;
end;
$function$;

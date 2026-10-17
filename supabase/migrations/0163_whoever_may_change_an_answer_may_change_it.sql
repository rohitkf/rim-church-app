/*
 * Whoever may change somebody else's answer may change it.
 *
 * `availability_guard_own_answer` (0018, 0103, 0146) refuses any change to
 * somebody else's status or note unless it comes from them, an Admin, or
 * an approved late ask. That was written when only an Admin could ever
 * change an answer, and it stayed after the grid (0137) gave "Change
 * somebody else's answer" (`avail.edit_others`) to Heads: the policy let a
 * Head's update through and the guard then refused it, so a Head could
 * mark who turned up and nothing else. Since 0162 a church sets that right
 * team by team, and a team that gives it means it.
 *
 * So the guard lets through whoever `may()` gives `avail.edit_others` for
 * the answer's team and service. Moving an answer to another person,
 * service or team stays refused to everybody but an Admin.
 */
create or replace function public.availability_guard_own_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.user_id <> auth.uid()
     and not public.is_admin(auth.uid())
     and not public.may(auth.uid(), 'avail.edit_others', new.department_id, new.service_id)
     and not public.availability_write_is_approval(new.user_id, new.service_id, new.department_id) then
    if new.status is distinct from old.status then
      raise exception 'Only the volunteer can change their own availability';
    end if;
    if new.note is distinct from old.note then
      raise exception 'Only the volunteer can change their own note';
    end if;
  end if;
  if new.user_id <> auth.uid() and not public.is_admin(auth.uid()) then
    if new.user_id is distinct from old.user_id
       or new.service_id is distinct from old.service_id
       or new.department_id is distinct from old.department_id then
      raise exception 'An availability answer cannot be moved to another person or service';
    end if;
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';

/*
 * A Head's yes to a late change can change the answer.
 *
 * Approving somebody's late ask (0095) writes their answer for them, as an
 * upsert on `availability`. When they had not answered yet that is an
 * insert, and it worked. When they had — which is most late asks: "I said
 * yes, I am ill now" — it is an update, and `availability_guard_own_answer`
 * (0018, 0103) refuses any update to somebody else's status or note unless
 * it comes from them or an Admin. The Head pressing Approve is neither, so
 * the approval failed with "Only the volunteer can change their own
 * availability", and the ask stayed waiting. Only an Admin could ever
 * approve a change to an answer already given.
 *
 * The guard is right about everything else, so it stays as it was and lets
 * through exactly one more write: the approval's own, which names its
 * request while it writes (0145). `availability_write_is_approval` checks
 * that name against a real, approved request for this person, service and
 * team, so the exception cannot be claimed by anything else. The words that
 * land in the note are the person's own reason, which is why the note rule
 * may give way too.
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

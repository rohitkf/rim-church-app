/*
 * The Owner can check their own DBS.
 *
 * 0324 let nobody mark their own DBS verified: a row somebody can mark as
 * checked is a row that says nothing. But `people.compliance` is the
 * Owner's alone out of the box (0126), so the one person who can check
 * anybody's could not have their own checked at all without first giving
 * the permission to somebody else. The Owner said so the day it shipped:
 * "I should be able to check my own DBS."
 *
 * So the Owner may. There is nobody above the Owner to do it, and what
 * the app records is unchanged and plain to read: who marked it, when,
 * and what they looked at, with the Owner's own name against their own
 * certificate in the log.
 *
 * **Only the Owner.** An Admin given `people.compliance` still cannot
 * mark their own: for them there is somebody else, the Owner, and their
 * own tick against their own certificate is the thing the rule was for.
 * `unverify_dbs()` never refused the caller's own and is left alone.
 */

create or replace function public.verify_dbs(
  p_person uuid,
  p_status_checked boolean,
  p_certificate_seen boolean,
  p_id_seen boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  checked text;
  its_kind text;
begin
  if me is null or not public.may(me, 'people.compliance') then
    raise exception 'You may not check DBS details.' using errcode = '42501';
  end if;
  -- Nobody checks their own, bar the Owner (0325): there is nobody above them to do it.
  if p_person is not distinct from me and not public.is_super_admin(me) then
    raise exception 'Somebody else has to check your own DBS.' using errcode = '42501';
  end if;
  if not (coalesce(p_status_checked, false) or coalesce(p_certificate_seen, false) or coalesce(p_id_seen, false)) then
    raise exception 'Tick what you checked.' using errcode = '22023';
  end if;

  update public.dbs_details d set
    verified_at = now(),
    verified_by = me,
    status_checked = coalesce(p_status_checked, false),
    certificate_seen = coalesce(p_certificate_seen, false),
    id_seen = coalesce(p_id_seen, false),
    -- Used once, and of no use to anybody after. Kept only where it is all the row has to go by.
    share_code = case when d.certificate_number is not null then null else d.share_code end,
    updated_at = now()
  where d.user_id = p_person
  returning d.kind into its_kind;
  if not found then
    raise exception 'They have not given any DBS details.' using errcode = 'P0002';
  end if;

  checked := concat_ws(', ',
    case when coalesce(p_status_checked, false) then 'checked online' end,
    case when coalesce(p_certificate_seen, false) then 'original certificate seen' end,
    case when coalesce(p_id_seen, false) then 'photo ID seen' end);
  insert into public.dbs_log (user_id, event, by, kind, wording)
  values (p_person, 'verified', me, its_kind, checked);
end;
$function$;

revoke all on function public.verify_dbs(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.verify_dbs(uuid, boolean, boolean, boolean) to authenticated;
select public.migration_done(325, '0325_the_owner_can_check_their_own_dbs', '7d735c2efd2a2aa9c7d9122e28438f4adddf910cb470a18ee58cff62edd70388');

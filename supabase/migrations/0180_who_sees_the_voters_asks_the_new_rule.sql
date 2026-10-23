/*
 * Who sees a poll's voters asks the rule as it now is.
 *
 * 0177 gave poll_is_for_me two more arguments (the guest choice) and
 * dropped the five-argument one. may_see_poll_voters (0172) still called
 * the old one. A SQL function's body is not a dependency Postgres tracks,
 * so the drop went through, and every read of team_poll_votes — the
 * Polls page asks for them with the polls — failed with "function
 * public.poll_is_for_me(text, uuid, uuid, uuid[], uuid) does not exist".
 *
 * Same rule as 0172, asking the seven-argument version.
 */

create or replace function public.may_see_poll_voters(poll uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_polls p
    where p.id = poll
      and public.poll_is_for_me(
        p.audience, p.department_id, p.service_id, p.recipient_ids, p.created_by,
        p.include_guests, p.guest_ids
      )
      and (
        not p.anonymous
        or public.is_super_admin(auth.uid())
        or (
          (select s.poll_voters_seen_by from public.app_settings s limit 1) in ('admins', 'leads')
          and public.is_admin(auth.uid())
        )
        or (
          (select s.poll_voters_seen_by from public.app_settings s limit 1) = 'leads'
          and p.department_id is not null
          and public.is_dept_head_or_assisting(auth.uid(), p.department_id)
        )
      )
  );
$$;

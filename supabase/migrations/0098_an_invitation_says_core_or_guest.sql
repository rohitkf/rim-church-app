/*
 * An invitation says which team, and now says how.
 *
 * 0086 made the team on an invitation mean something: accepting it joins
 * the team rather than leaving the inviter to add somebody by hand. It
 * joined them as `core`, hard-coded, because that is what the column
 * defaults to and nobody had been asked anything else.
 *
 * But the two are not the same thing and the difference matters on every
 * page that counts. A core member is somebody the team is short of when
 * they cannot serve; a guest is somebody who helps when they are about.
 * Availability is measured against the core, and so is the readiness ring
 * — so inviting a visiting sound engineer as core quietly tells the Audio
 * team it is a person down every Sunday they are not there.
 *
 * The inviter is asked, at the only moment anyone is asking them anything,
 * and the answer rides along to the moment they arrive.
 */

alter table public.invitations
  add column if not exists member_type public.member_type not null default 'core';

comment on column public.invitations.member_type is
  'How they join the team on the invitation: core, or guest. Core is the default, as it was before anybody was asked.';

/**
 * Put somebody on the team they were invited into, as what they were
 * invited as.
 *
 * Otherwise unchanged from 0086: silent when there is no invitation, when
 * it named no team, when they are already a member, or when their profile
 * is not written yet — a sign-in must never fail over a roster.
 *
 * `do nothing` on conflict still stands, and deliberately: somebody who is
 * already on the team keeps the standing they already have rather than
 * being moved by an invitation that arrived after the fact.
 */
create or replace function public.join_invited_team(uid uuid, addr text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_members (department_id, user_id, member_type)
  select i.department_id, uid, coalesce(i.member_type, 'core'::member_type)
  from public.invitations i
  where uid is not null
    and addr is not null
    and lower(i.email) = lower(addr)
    and i.department_id is not null
    and exists (select 1 from public.profiles p where p.id = uid)
  on conflict (department_id, user_id) do nothing;
$$;

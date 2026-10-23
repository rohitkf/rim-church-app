/*
 * A poll belongs to whoever asked it, and guests are asked by choice.
 *
 * Two changes the church asked for.
 *
 * 1. Changing or removing a poll is the asker's, or an Admin's (the Owner
 *    is one, `is_admin`). Until now a team's Head — anybody with
 *    `msg.polls` for the team — could also edit or delete any poll
 *    addressed to that team, and anybody with `msg.polls` everywhere could
 *    edit or delete every poll. Asking is unchanged: the grid still says
 *    who may post one (0139).
 *
 * 2. A poll can leave guests out, or ask only the guests it names.
 *    A guest here is somebody who is in the poll's audience only through a
 *    guest place on a team (`department_members.member_type = 'guest'`):
 *
 *      team     — a guest on that team who does not lead it;
 *      service  — on the rota for it, and a guest on every team they serve
 *                 there with (a core member or a Head of one of those
 *                 teams is not a guest of the poll);
 *      everyone — a guest on some team, core on none, and holding no role.
 *
 *    A Church Member on no team is not a guest. A poll for named people
 *    asks exactly those people and nothing here changes that.
 *
 *    `include_guests` false leaves every such guest out. True with
 *    `guest_ids` null asks every guest, which is what every poll did
 *    before this, so the polls already posted carry on unchanged. True with
 *    a list asks only the guests on it.
 *
 * Who sees a poll and who is told about it stay one rule: the same helper
 * decides both, inside poll_is_for_me and poll_recipients.
 */

alter table public.team_polls
  add column if not exists include_guests boolean not null default true,
  add column if not exists guest_ids uuid[];

/*
 * Whether this person comes into the poll only as a guest. Takes a uuid,
 * so it is the database's own and not the app's: only the definer-rights
 * functions below call it.
 */
create or replace function public.poll_person_is_guest(
  p_audience text,
  p_department uuid,
  p_service uuid,
  uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_audience
    when 'team' then
      exists (
        select 1 from public.department_members m
        where m.department_id = p_department and m.user_id = uid and m.member_type = 'guest'
      )
      and not public.is_dept_head_or_assisting(uid, p_department)
    when 'service' then
      exists (
        select 1 from public.rota_assignments a
        join public.department_members m
          on m.department_id = a.department_id and m.user_id = a.user_id and m.member_type = 'guest'
        where a.service_id = p_service
          and a.user_id = uid
          and (p_department is null or a.department_id = p_department)
      )
      and not exists (
        select 1 from public.rota_assignments a
        where a.service_id = p_service
          and a.user_id = uid
          and (p_department is null or a.department_id = p_department)
          and (
            exists (
              select 1 from public.department_members m
              where m.department_id = a.department_id and m.user_id = uid and m.member_type = 'core'
            )
            or public.is_dept_head_or_assisting(uid, a.department_id)
          )
      )
    when 'everyone' then
      exists (select 1 from public.department_members m where m.user_id = uid and m.member_type = 'guest')
      and not exists (select 1 from public.department_members m where m.user_id = uid and m.member_type = 'core')
      and not exists (select 1 from public.user_roles r where r.user_id = uid)
    else false
  end;
$$;

/* Whether the poll's guest choice lets this person in. */
create or replace function public.poll_admits(
  p_audience text,
  p_department uuid,
  p_service uuid,
  p_include_guests boolean,
  p_guest_ids uuid[],
  uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_audience = 'people'
    or (p_include_guests and (p_guest_ids is null or uid = any (p_guest_ids)))
    or not public.poll_person_is_guest(p_audience, p_department, p_service, uid);
$$;

revoke all on function public.poll_person_is_guest(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.poll_admits(text, uuid, uuid, boolean, uuid[], uuid) from public, anon, authenticated;

/* The rule, now with the guest choice. Answers about the caller only. */
create or replace function public.poll_is_for_me(
  p_audience text,
  p_department uuid,
  p_service uuid,
  p_recipients uuid[],
  p_created_by uuid,
  p_include_guests boolean,
  p_guest_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin(auth.uid())
    or p_created_by = auth.uid()
    or (
      (
        p_audience = 'everyone'
        or (p_audience = 'team' and public.may_read_team(p_department))
        or (p_audience = 'people' and auth.uid() = any (p_recipients))
        or (
          p_audience = 'service'
          and exists (
            select 1 from public.rota_assignments a
            where a.service_id = p_service
              and a.user_id = auth.uid()
              and (p_department is null or a.department_id = p_department)
          )
        )
      )
      and public.poll_admits(p_audience, p_department, p_service, p_include_guests, p_guest_ids, auth.uid())
    )
  );
$$;

revoke all on function public.poll_is_for_me(text, uuid, uuid, uuid[], uuid, boolean, uuid[]) from public, anon;
grant execute on function public.poll_is_for_me(text, uuid, uuid, uuid[], uuid, boolean, uuid[]) to authenticated;

create or replace function public.may_see_poll(poll uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_open_page(auth.uid(), 'polls') and exists (
    select 1 from public.team_polls p
    where p.id = poll
      and public.poll_is_for_me(
        p.audience, p.department_id, p.service_id, p.recipient_ids, p.created_by,
        p.include_guests, p.guest_ids
      )
  );
$$;

drop policy if exists team_polls_select on public.team_polls;
create policy team_polls_select on public.team_polls
  for select using (
    public.poll_is_for_me(audience, department_id, service_id, recipient_ids, created_by, include_guests, guest_ids)
    and (select public.can_open_page(auth.uid(), 'polls'))
    and clears_at > now()
  );

-- Nothing calls the five-argument rule any more.
drop function if exists public.poll_is_for_me(text, uuid, uuid, uuid[], uuid);

/* Who a poll reaches when it is posted: the same people it is visible to. */
create or replace function public.poll_recipients(p public.team_polls)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select r from unnest(
      case p.audience
        when 'everyone' then array(select id from public.profiles)
        when 'team' then array(
          select user_id from public.department_members where department_id = p.department_id
          union
          select user_id from public.user_roles
          where department_id = p.department_id and role_type in ('department_head', 'assisting_head')
        )
        when 'people' then array(select id from public.profiles where id = any (p.recipient_ids))
        when 'service' then array(
          select distinct a.user_id from public.rota_assignments a
          where a.service_id = p.service_id
            and (p.department_id is null or a.department_id = p.department_id)
        )
        else '{}'::uuid[]
      end
    ) as r
    where public.poll_admits(p.audience, p.department_id, p.service_id, p.include_guests, p.guest_ids, r)
  );
$$;

revoke all on function public.poll_recipients(public.team_polls) from public, anon, authenticated;

-- Changing and removing: the asker, or an Admin. The check still bounds
-- what the asker may turn the poll into by what they may ask (0139).
drop policy if exists team_polls_change on public.team_polls;
create policy team_polls_change on public.team_polls
  for update using (
    public.is_admin(auth.uid()) or created_by = auth.uid()
  ) with check (
    public.is_admin(auth.uid())
    or (
      created_by = auth.uid()
      and (
        public.may(auth.uid(), 'msg.polls')
        or (
          audience in ('team', 'service')
          and department_id is not null
          and public.may(auth.uid(), 'msg.polls', department_id)
        )
      )
    )
  );

drop policy if exists team_polls_delete on public.team_polls;
create policy team_polls_delete on public.team_polls
  for delete using (public.is_admin(auth.uid()) or created_by = auth.uid());

drop policy if exists team_poll_options_write on public.team_poll_options;
create policy team_poll_options_write on public.team_poll_options
  for all using (
    exists (
      select 1 from public.team_polls p
      where p.id = poll_id and (public.is_admin(auth.uid()) or p.created_by = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.team_polls p
      where p.id = poll_id and (public.is_admin(auth.uid()) or p.created_by = auth.uid())
    )
  );

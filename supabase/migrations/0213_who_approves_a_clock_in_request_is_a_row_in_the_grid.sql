/*
 * Who approves a request to be clocked in is a row in the grid.
 *
 * Since 0194 Settings › Clock in kept its approvers in two columns of
 * their own: app_settings.clock_in_approver_teams, and
 * clock_in_approvers — whether a listed team's Heads approve, or anybody
 * on it. Like the room's other list (0209), approving is now a
 * capability, `clockin.approve`, and each listed team holds a grant of it
 * (0208).
 *
 * A team's grant carried its whole roster, which would have lost the
 * "Heads" choice. So a team's grant can now be for its Heads alone —
 * `leads_only`: its Head and Assisting Heads, not its roster — which any
 * grant may use, not only this one. The listed teams' grants take the
 * room's choice.
 *
 *   Admin                     yes, always (as clock_in_admin says)
 *   Team Head, Assisting Head no, out of the box; the church may say yes
 *   Team Member, Coordinator  no, out of the box; the church may say yes
 *   Church Member             only by a grant
 *
 * may_approve_clock_ins(), which the requests' read rule, the decision
 * and the notice to approvers all ask, asks may(). Checked on production
 * before applying, for every person: nobody's answer changed, and the
 * notice goes to the same people.
 *
 * Both columns stay, read by nothing, until a later release drops them.
 */

alter table public.permission_grants
  add column leads_only boolean not null default false,
  add constraint permission_grants_leads_only_is_a_teams check (not leads_only or department_id is not null);

comment on column public.permission_grants.leads_only is
  'A team''s grant for its Head and Assisting Heads only, not its roster (0213).';

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('clockin.approve', 'admin', '{all}', 'all'),
  ('clockin.approve', 'head', '{none,all}', 'none'),
  ('clockin.approve', 'assistant', '{none,all}', 'none'),
  ('clockin.approve', 'coordinator', '{none,all}', 'none'),
  ('clockin.approve', 'member', '{none,all}', 'none'),
  ('clockin.approve', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The listed teams, as grants: everywhere, for their Heads or their whole
-- team as the room said.
insert into public.permission_grants (capability, department_id, reach, leads_only)
select 'clockin.approve', d.id, 'all', coalesce(s.clock_in_approvers, 'leads') <> 'members'
from public.app_settings s
cross join lateral jsonb_array_elements_text(coalesce(s.clock_in_approver_teams, '[]'::jsonb)) t(id)
join public.departments d on d.id::text = t.id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- may(), with a team's grant for its Heads alone
-- ---------------------------------------------------------------------------

create or replace function public.may(
  uid uuid,
  cap text,
  dept uuid default null,
  svc uuid default null,
  who uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mine boolean := coalesce(who = uid, false);
  r_newcomer text;
  r_admin text;
  r_head text;
  r_assistant text;
  r_member text;
  r_coordinator text;
begin
  if uid is null then
    return false;
  end if;

  if exists (select 1 from public.app_owner o where o.user_id = uid) then
    return true;
  end if;

  -- Every tier's reach for this capability in one read, as
  -- permission_reach() gives it: the team's own rule where the tier is one
  -- a team may set and the team has a valid one, else the church's rule
  -- where valid, else the catalog's default, else none. A Church Member and
  -- an Admin are the church's alone (a team cannot narrow its Admins).
  select
    coalesce(max(x.reach) filter (where x.role_key = 'newcomer'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'admin'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'head'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'assistant'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'member'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'coordinator'), 'none')
  into r_newcomer, r_admin, r_head, r_assistant, r_member, r_coordinator
  from (
    select c.role_key,
      coalesce(
        case when c.role_key in ('head', 'assistant', 'member', 'coordinator') then (
          select t.reach from public.department_permissions t
          where t.department_id = dept and t.role_key = c.role_key
            and t.capability = c.capability and t.reach = any (c.reaches)
        ) end,
        case when o.reach = any (c.reaches) then o.reach end,
        c.default_reach
      ) as reach
    from public.permission_catalog c
    left join public.role_permissions o
      on o.role_key = c.role_key and o.capability = c.capability
    where c.capability = cap
  ) x;

  -- Everybody signed in is a Church Member, so this needs no lookup.
  if r_newcomer = 'all' or (r_newcomer <> 'none' and mine) then
    return true;
  end if;

  if r_admin <> 'none' and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'admin'
  ) then
    if r_admin = 'all' or mine then
      return true;
    end if;
  end if;

  if r_head <> 'none' and exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role_type = 'department_head' and r.department_id is not null
  ) then
    if r_head = 'all' or mine or (r_head = 'team' and dept is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = uid and r.department_id = dept and r.role_type = 'department_head'
    )) then
      return true;
    end if;
  end if;

  if r_assistant <> 'none' and exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role_type = 'assisting_head' and r.department_id is not null
  ) then
    if r_assistant = 'all' or mine or (r_assistant = 'team' and dept is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = uid and r.department_id = dept and r.role_type = 'assisting_head'
    )) then
      return true;
    end if;
  end if;

  if r_member <> 'none' then
    if r_member = 'team' and dept is not null and exists (
      select 1 from public.department_members m where m.department_id = dept and m.user_id = uid
    ) then
      return true;
    end if;
    if (r_member = 'all' or mine)
       and exists (select 1 from public.department_members m where m.user_id = uid) then
      return true;
    end if;
  end if;

  if r_coordinator <> 'none' then
    if r_coordinator in ('team', 'all') and svc is not null and dept is not null and exists (
      select 1 from public.rota_assignments a
      where a.service_id = svc and a.department_id = dept and a.user_id = uid
        and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    ) then
      return true;
    end if;
    if (r_coordinator = 'all' or mine) and exists (
      select 1 from public.rota_assignments a
      where a.user_id = uid and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    ) then
      return true;
    end if;
  end if;

  -- Given one thing more (0208): this person by name, or everybody on a
  -- team (its roster, its Head and Assisting Heads — or, since 0213, only
  -- its Head and Assisting Heads), may do this —
  -- everywhere, or on the teams they are on. Asked last, so a grant only
  -- ever adds to what the grid gives; with none, every answer is as it was.
  if exists (
    select 1 from public.permission_grants g
    where g.capability = cap
      and (
        g.user_id = uid
        or (g.department_id is not null and (
          (not g.leads_only and exists (
            select 1 from public.department_members m where m.department_id = g.department_id and m.user_id = uid
          ))
          or exists (
            select 1 from public.user_roles r
            where r.user_id = uid and r.department_id = g.department_id
              and r.role_type in ('department_head', 'assisting_head')
          )
        ))
      )
      and (
        g.reach = 'all'
        or mine
        or (dept is not null and (
          g.department_id = dept
          or (g.user_id is not null and (
            exists (select 1 from public.department_members m where m.department_id = dept and m.user_id = uid)
            or exists (
              select 1 from public.user_roles r
              where r.user_id = uid and r.department_id = dept
                and r.role_type in ('department_head', 'assisting_head')
            )
          ))
        ))
      )
  ) then
    return true;
  end if;

  return false;
end;
$$;


create or replace function public.may_approve_clock_ins(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.clock_in_admin(uid)
    or public.may(uid, 'clockin.approve')
  );
$$;

-- ---------------------------------------------------------------------------
-- Writing them: a team's grant may say it is for its Heads alone
-- ---------------------------------------------------------------------------

create or replace function public.set_permission_grants(p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  change jsonb;
  v_cap text;
  v_reach text;
  v_person uuid;
  v_team uuid;
  v_leads boolean;
begin
  if not public.may(auth.uid(), 'app.permissions') then
    raise exception 'Only the Owner or an Admin can give somebody one thing more.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Send the changes as a list.' using errcode = '22023';
  end if;

  for change in select value from jsonb_array_elements(p_changes) loop
    v_cap := change ->> 'capability';
    v_reach := change ->> 'reach';
    v_person := nullif(change ->> 'person', '')::uuid;
    v_team := nullif(change ->> 'team', '')::uuid;
    v_leads := coalesce((change ->> 'leads_only')::boolean, false);

    if (v_person is null) = (v_team is null) then
      raise exception 'A grant is for one person or one team.' using errcode = '22023';
    end if;
    if v_leads and v_team is null then
      raise exception 'Only a team''s grant can be for its Heads alone.' using errcode = '22023';
    end if;
    if v_person is not null and not exists (select 1 from public.profiles p where p.id = v_person) then
      raise exception 'There is no such person.' using errcode = '22023';
    end if;
    if v_team is not null and not exists (select 1 from public.departments d where d.id = v_team) then
      raise exception 'There is no such team.' using errcode = '22023';
    end if;

    if v_reach is null then
      delete from public.permission_grants g
      where g.capability = v_cap
        and (g.user_id = v_person or g.department_id = v_team);
      continue;
    end if;

    if not public.permission_grant_is_valid(v_cap, v_reach) then
      raise exception '% cannot be given to somebody %.', v_cap,
        case v_reach when 'team' then 'on their teams' when 'all' then 'everywhere' else coalesce(v_reach, 'at all') end
        using errcode = '22023';
    end if;

    if v_person is not null then
      insert into public.permission_grants (capability, user_id, reach, granted_by)
      values (v_cap, v_person, v_reach, auth.uid())
      on conflict (capability, user_id) where user_id is not null do update
        set reach = excluded.reach, granted_by = excluded.granted_by, granted_at = now();
    else
      insert into public.permission_grants (capability, department_id, reach, leads_only, granted_by)
      values (v_cap, v_team, v_reach, v_leads, auth.uid())
      on conflict (capability, department_id) where department_id is not null do update
        set reach = excluded.reach, leads_only = excluded.leads_only,
            granted_by = excluded.granted_by, granted_at = now();
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

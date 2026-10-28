/*
 * A grant can have an end date.
 *
 * One thing more (0208) was given for good: somebody covering a Head's
 * rota for a month, or a team approving clock-ins for one season, kept it
 * until an Admin remembered to take it back. Now a grant may say until
 * when — permission_grants.expires_at, null for good. may() asks only the
 * grants still in date, so one that has ended stops at the moment it
 * ends, not when it is noticed; a daily job then removes the row, which
 * the log (0216) records as the app's own change, with the date it had.
 *
 * set_permission_grants() takes `until` on a change — a time, or null
 * for no end. A change that does not mention it, as the rooms' do (Clock
 * in, Prayer, Stage Layout and the planner's buttons say every grant
 * again on Save), leaves a live date alone and lets an ended one go, so
 * saying the thing again gives it for good, as the room shows. A time
 * already past is refused.
 *
 * The log gains until_before and until_after, and a change of the date
 * alone is logged like any other.
 *
 * Checked on production before applying: may() answers as before for
 * every person, capability and team (no grant has a date yet), and the
 * writer, the trigger and the sweep behave as written, on a copy.
 */

alter table public.permission_grants
  add column expires_at timestamptz;

comment on column public.permission_grants.expires_at is
  'When the grant ends, null for good: may() passes it by after that, and delete_expired_permission_grants() removes it (0218).';

create index permission_grants_expires_at_idx
  on public.permission_grants (expires_at) where expires_at is not null;

alter table public.permission_changes
  add column until_before timestamptz,
  add column until_after timestamptz;

-- ---------------------------------------------------------------------------
-- may(): a grant past its end date is as if taken back
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
  r_pastor text;
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
    coalesce(max(x.reach) filter (where x.role_key = 'pastor'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'head'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'assistant'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'member'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'coordinator'), 'none')
  into r_newcomer, r_admin, r_pastor, r_head, r_assistant, r_member, r_coordinator
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

  -- A Pastor (0214): a church-wide standing, like an Admin's, and the
  -- church's alone. Out of the box it reaches only the three prayer rows.
  if r_pastor <> 'none' and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'pastor'
  ) then
    if r_pastor = 'all' or mine then
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
  -- A grant past its end date (0218) is as if taken back.
  if exists (
    select 1 from public.permission_grants g
    where g.capability = cap
      and (g.expires_at is null or g.expires_at > now())
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

-- ---------------------------------------------------------------------------
-- Writing a grant, with or without an end date
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
  v_dated boolean;
  v_until timestamptz;
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
    -- An end date (0218): said, as a time or null for good, or not mentioned.
    v_dated := change ? 'until';
    v_until := nullif(change ->> 'until', '')::timestamptz;
    if v_until is not null and v_until <= now() then
      raise exception 'An end date has to be later than now.' using errcode = '22023';
    end if;

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

    -- A change that does not mention the date leaves a live one alone, as
    -- the rooms' changes do when they say a grant again; an ended one it
    -- lets go, so saying the thing again gives it for good, as the room shows.
    if v_person is not null then
      insert into public.permission_grants (capability, user_id, reach, granted_by, expires_at)
      values (v_cap, v_person, v_reach, auth.uid(), v_until)
      on conflict (capability, user_id) where user_id is not null do update
        set reach = excluded.reach, granted_by = excluded.granted_by, granted_at = now(),
            expires_at = case
              when v_dated then excluded.expires_at
              when permission_grants.expires_at > now() then permission_grants.expires_at
            end;
    else
      insert into public.permission_grants (capability, department_id, reach, leads_only, granted_by, expires_at)
      values (v_cap, v_team, v_reach, v_leads, auth.uid(), v_until)
      on conflict (capability, department_id) where department_id is not null do update
        set reach = excluded.reach, leads_only = excluded.leads_only,
            granted_by = excluded.granted_by, granted_at = now(),
            expires_at = case
              when v_dated then excluded.expires_at
              when permission_grants.expires_at > now() then permission_grants.expires_at
            end;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The log says the date before and after
-- ---------------------------------------------------------------------------

create or replace function public.log_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'role_permissions' then
    if tg_op = 'UPDATE' and old.reach is not distinct from new.reach then
      return null;
    end if;
    insert into public.permission_changes (changed_by, kind, capability, role_key, before, after)
    values (
      auth.uid(), 'cell',
      coalesce(new.capability, old.capability), coalesce(new.role_key, old.role_key),
      case when tg_op <> 'INSERT' then old.reach end,
      case when tg_op <> 'DELETE' then new.reach end
    );
  elsif tg_table_name = 'department_permissions' then
    if tg_op = 'UPDATE' and old.reach is not distinct from new.reach then
      return null;
    end if;
    insert into public.permission_changes (changed_by, kind, capability, role_key, department_id, before, after)
    values (
      auth.uid(), 'team',
      coalesce(new.capability, old.capability), coalesce(new.role_key, old.role_key),
      coalesce(new.department_id, old.department_id),
      case when tg_op <> 'INSERT' then old.reach end,
      case when tg_op <> 'DELETE' then new.reach end
    );
  else
    if tg_op = 'UPDATE' and old.reach is not distinct from new.reach
       and old.leads_only is not distinct from new.leads_only
       and old.expires_at is not distinct from new.expires_at then
      return null;
    end if;
    insert into public.permission_changes
      (changed_by, kind, capability, department_id, user_id, before, after,
       leads_only_before, leads_only_after, until_before, until_after)
    values (
      auth.uid(), 'grant',
      coalesce(new.capability, old.capability),
      coalesce(new.department_id, old.department_id), coalesce(new.user_id, old.user_id),
      case when tg_op <> 'INSERT' then old.reach end,
      case when tg_op <> 'DELETE' then new.reach end,
      case when tg_op <> 'INSERT' then old.leads_only end,
      case when tg_op <> 'DELETE' then new.leads_only end,
      case when tg_op <> 'INSERT' then old.expires_at end,
      case when tg_op <> 'DELETE' then new.expires_at end
    );
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The sweep: an ended grant's row goes the next night
-- ---------------------------------------------------------------------------

create or replace function public.delete_expired_permission_grants()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.permission_grants where expires_at is not null and expires_at <= now();
$$;

revoke all on function public.delete_expired_permission_grants() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'delete-expired-permission-grants';
    perform cron.schedule('delete-expired-permission-grants', '45 2 * * *', 'select public.delete_expired_permission_grants()');
  end if;
end $cron$;

notify pgrst, 'reload schema';

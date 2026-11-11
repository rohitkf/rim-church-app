/*
 * One person can be refused one thing.
 *
 * The grid says what a role may do, a team's rule narrows or widens it for
 * that team, and a grant (0208) gives one person or one team one thing
 * more. Nothing took one thing away from one person: the only way to stop
 * somebody was to change the rule for everybody with their role. The Owner
 * asked for that control (November 2026).
 *
 * - permission_blocks: a person and a capability. While the row is there,
 *   may() answers no for them on it — before the role tiers and before the
 *   grants, so a block wins over all of them.
 * - Never the Owner, and never an Admin. An Admin's standing is fixed in
 *   many rules that do not ask may(), so a block on one would look set and
 *   do nothing; the write refuses it and says why, and may() passes a
 *   block by for an Admin so the two always agree.
 * - With no rows, may() is word for word the function 0270 left, plus one
 *   indexed lookup that finds nothing: every answer is as it was.
 * - Read by everybody signed in, as the grid and the grants are, so each
 *   phone draws its buttons from the same answer; written only through
 *   set_permission_blocks(), by whoever may change the grid; every change
 *   is in the log (0216).
 */

create table public.permission_blocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null,
  blocked_by uuid references public.profiles(id) on delete set null,
  blocked_at timestamptz not null default now(),
  primary key (user_id, capability)
);

comment on table public.permission_blocks is
  'One person refused one capability, whatever their role, team or grants say; may() asks it first (0273).';

create index permission_blocks_blocked_by_idx on public.permission_blocks (blocked_by);

alter table public.permission_blocks enable row level security;
create policy permission_blocks_select on public.permission_blocks
  for select to authenticated using ((select auth.uid()) is not null);

revoke all on public.permission_blocks from anon;
revoke insert, update, delete, truncate on public.permission_blocks from authenticated;
grant select on public.permission_blocks to authenticated;

-- Screens hear that it changed, as they do for the grid and the grants.
create trigger permission_blocks_live after insert or update or delete on public.permission_blocks
  for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- The log (0216) gains a kind
-- ---------------------------------------------------------------------------

alter table public.permission_changes drop constraint permission_changes_kind_check;
alter table public.permission_changes
  add constraint permission_changes_kind_check check (kind in ('cell', 'team', 'grant', 'block'));

create or replace function public.log_permission_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.permission_changes (changed_by, kind, capability, user_id, before, after)
  values (
    auth.uid(), 'block',
    coalesce(new.capability, old.capability), coalesce(new.user_id, old.user_id),
    case when tg_op = 'DELETE' then 'blocked' end,
    case when tg_op = 'INSERT' then 'blocked' end
  );
  return null;
end;
$$;
revoke execute on function public.log_permission_block() from public, anon, authenticated;

create trigger permission_blocks_logged
  after insert or delete on public.permission_blocks
  for each row execute function public.log_permission_block();

-- ---------------------------------------------------------------------------
-- may(): the block is asked first
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
  r_overwatch text;
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

  -- Refused by name (0273): this one person may not do this one thing,
  -- whatever their role, their team or a grant says. Asked before every
  -- tier, so nothing below can give it back. Never the Owner (above), and
  -- never an Admin, whose standing is not the grid's to take away — a
  -- block on somebody later made an Admin sleeps until they are not.
  if exists (
    select 1 from public.permission_blocks b where b.user_id = uid and b.capability = cap
  ) and not exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'admin'
  ) then
    return false;
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
    coalesce(max(x.reach) filter (where x.role_key = 'overwatch'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'head'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'assistant'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'member'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'coordinator'), 'none')
  into r_newcomer, r_admin, r_pastor, r_overwatch, r_head, r_assistant, r_member, r_coordinator
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

  -- Overwatch (0270): the same kind of standing. Never on the five things
  -- done as Overwatch — those cells are overwatch_may()'s to read, each
  -- only on a page Settings › Overwatch leaves open.
  if r_overwatch <> 'none'
     and cap not in ('msg.board_post', 'msg.chat', 'msg.polls', 'issue.as_overwatch', 'debrief.as_overwatch')
     and exists (
       select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'overwatch'
     ) then
    if r_overwatch = 'all' or mine then
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
-- Writing them
-- ---------------------------------------------------------------------------

/*
 * Each change: { capability, person, blocked }. `blocked` false takes the
 * block away. Whoever may change the grid may change these.
 */
create or replace function public.set_permission_blocks(p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  change jsonb;
  v_cap text;
  v_person uuid;
  v_blocked boolean;
begin
  if not public.may(auth.uid(), 'app.permissions') then
    raise exception 'Only the Owner or an Admin can block somebody from something.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Send the changes as a list.' using errcode = '22023';
  end if;

  for change in select value from jsonb_array_elements(p_changes) loop
    v_cap := change ->> 'capability';
    v_person := nullif(change ->> 'person', '')::uuid;
    v_blocked := coalesce((change ->> 'blocked')::boolean, false);

    if v_person is null or not exists (select 1 from public.profiles p where p.id = v_person) then
      raise exception 'There is no such person.' using errcode = '22023';
    end if;

    if not v_blocked then
      delete from public.permission_blocks b where b.user_id = v_person and b.capability = v_cap;
      continue;
    end if;

    if not exists (select 1 from public.permission_catalog c where c.capability = v_cap) then
      raise exception 'There is no such permission: %.', coalesce(v_cap, '(none)') using errcode = '22023';
    end if;
    if exists (select 1 from public.app_owner o where o.user_id = v_person) then
      raise exception 'The Owner cannot be blocked from anything.' using errcode = '22023';
    end if;
    if exists (select 1 from public.user_roles r where r.user_id = v_person and r.role_type = 'admin') then
      raise exception 'An Admin cannot be blocked. Take their Admin role away first.' using errcode = '22023';
    end if;

    insert into public.permission_blocks (user_id, capability, blocked_by)
    values (v_person, v_cap, auth.uid())
    on conflict (user_id, capability) do nothing;
  end loop;
end;
$$;
revoke all on function public.set_permission_blocks(jsonb) from public, anon;
grant execute on function public.set_permission_blocks(jsonb) to authenticated;

notify pgrst, 'reload schema';

/*
 * An account can be blocked without being removed.
 *
 * The Owner asked for a way to stop one person using the app: "i can
 * block a user and they'll be met with a modal when they login, which
 * says something like BLOCKED BY ADMINISTRATOR. PLEASE CONTACT ADMIN TO
 * RESOLVE" (November 2026). Until now the only way to stop somebody was
 * to remove their account, which takes their history with it and cannot
 * be taken back.
 *
 * A block is a row with the person's name on it. While it is there the
 * person can still sign in, and that is all: the app shows them a page
 * that says the account is blocked and who to speak to, and nothing
 * behind it loads. Taking the row away puts everything back exactly as
 * it was — their teams, their rota, their roles were never touched.
 *
 *   people.block   block and unblock an account. Admins out of the box.
 *                  The rules are the ones removing an account has (0169):
 *                  never yourself, never the Owner, and an Admin only by
 *                  the Owner.
 *
 * Blocking is the database's, not the app's, in the three places a
 * signed-in person can reach it:
 *
 *   the Data API   reject_removed_user (0070) runs before every request.
 *                  It already turns away an account that has been removed
 *                  and, since 0278, everybody while the app is closed; it
 *                  turns a blocked account away with a reason of its own
 *                  (detail account_blocked). my_standing() is the one
 *                  thing still answered, so the app can say why.
 *   may()          answers no. An edge function that asks on the person's
 *                  behalf with the service key (invite, registration-email)
 *                  never passes the hook, and neither does a list of who
 *                  to tell; they all end at may().
 *   storage        one restrictive policy on storage.objects. Files are
 *                  not served through the Data API, and some are open to
 *                  anybody signed in (a profile picture, a team's
 *                  handbook), so the policies there need saying no to.
 *
 * What a block does not do: it does not sign the person out (the page
 * they see is the point), and it does not stop a push that is already on
 * its way to their phone — push-notify asks account_is_blocked() before
 * it sends, which is that function's change, deployed separately.
 */

-- ---------------------------------------------------------------------------
-- One row in the grid
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.block', 'admin', '{none,all}', 'all'),
  ('people.block', 'head', '{none,all}', 'none'),
  ('people.block', 'assistant', '{none,all}', 'none'),
  ('people.block', 'coordinator', '{none,all}', 'none'),
  ('people.block', 'member', '{none,all}', 'none'),
  ('people.block', 'newcomer', '{none,all}', 'none'),
  ('people.block', 'overwatch', '{none,all}', 'none'),
  ('people.block', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------------
-- The blocks
-- ---------------------------------------------------------------------------

create table public.account_blocks (
  -- One block per person: they are blocked or they are not.
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Why, for the people who may block. The person blocked is never shown it.
  reason text,
  blocked_by uuid references public.profiles(id) on delete set null,
  blocked_at timestamptz not null default now(),
  constraint account_blocks_reason_length check (reason is null or length(reason) between 1 and 300)
);

comment on table public.account_blocks is
  'An account that may sign in and do nothing else until the row is taken away (0279). Written only by block_account() and unblock_account().';

-- Who did it is a foreign key like any other (0204).
create index account_blocks_blocked_by_idx on public.account_blocks (blocked_by);

alter table public.account_blocks enable row level security;

-- Whoever may block sees who is blocked, and why. Nobody else does: that
-- an account is blocked is between the person and the people who run the
-- app. There is no policy to write through; the two functions below are
-- the only way in, because the rules about who may block whom are theirs.
create policy account_blocks_select on public.account_blocks
  for select to authenticated
  using ((select public.may((select auth.uid()), 'people.block')));

revoke all on public.account_blocks from anon, authenticated;
grant select on public.account_blocks to authenticated;

-- Screens hear that it changed: the list of people for whoever is looking
-- at it, and the blocked person's own, which asks where it stands.
create trigger account_blocks_live after insert or update or delete on public.account_blocks
  for each statement execute function public.live_table_changed();

/*
 * Is this account blocked? The one definition, read by the hook, by
 * my_standing(), by the storage policy and by push-notify. Never the
 * Owner: block_account() refuses, and the trigger below clears a block
 * from whoever becomes the Owner, but the app must not be able to lock
 * its Owner out on the strength of two other things having worked.
 */
create or replace function public.account_is_blocked(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.account_blocks b where b.user_id = uid)
     and not exists (select 1 from public.app_owner o where o.user_id = uid);
$$;

-- The database's own, like may(): a policy calls it, the hook refuses it
-- by name over the API (it would say who is blocked to anybody who asked).
revoke all on function public.account_is_blocked(uuid) from public, anon;
grant execute on function public.account_is_blocked(uuid) to authenticated, service_role;

/*
 * Block an account. The rules are admin_delete_user's (0169), for the
 * same reasons: nobody blocks themselves by a slip, nobody blocks the
 * Owner, and an Admin's standing is the Owner's to take away. Blocking
 * somebody already blocked changes the note and nothing else.
 */
create or replace function public.block_account(target_user_id uuid, why text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may(auth.uid(), 'people.block') then
    raise exception 'Blocking accounts is not open to you.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot block your own account';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'That account is no longer here';
  end if;
  if public.is_super_admin(target_user_id) then
    raise exception 'The owner''s account cannot be blocked';
  end if;
  if public.is_admin(target_user_id) and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can block another Admin''s account';
  end if;

  insert into public.account_blocks (user_id, reason, blocked_by)
  values (target_user_id, nullif(left(btrim(coalesce(why, '')), 300), ''), auth.uid())
  on conflict (user_id) do update set reason = excluded.reason;
end;
$$;

/*
 * Take a block away. Whoever may block may unblock, with the one rule
 * kept: an Admin was blocked by the Owner, so only the Owner lifts it.
 * Unblocking somebody who is not blocked does nothing.
 */
create or replace function public.unblock_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may(auth.uid(), 'people.block') then
    raise exception 'Unblocking accounts is not open to you.';
  end if;
  if public.is_admin(target_user_id) and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can unblock another Admin''s account';
  end if;

  delete from public.account_blocks b where b.user_id = target_user_id;
end;
$$;

revoke all on function public.block_account(uuid, text) from public, anon;
grant execute on function public.block_account(uuid, text) to authenticated;
revoke all on function public.unblock_account(uuid) from public, anon;
grant execute on function public.unblock_account(uuid) to authenticated;

/*
 * Whoever becomes the Owner is not blocked. Ownership is handed over to
 * somebody by name (0033); if that somebody had a block on them, it ends
 * there, and does not come back to life should they hand ownership on.
 */
create or replace function public.owner_is_never_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_blocks b where b.user_id = new.user_id;
  return null;
end;
$$;

revoke all on function public.owner_is_never_blocked() from public, anon, authenticated;

create trigger app_owner_is_never_blocked
  after insert or update of user_id on public.app_owner
  for each row execute function public.owner_is_never_blocked();

-- ---------------------------------------------------------------------------
-- may(): a blocked account may do nothing
-- ---------------------------------------------------------------------------

/*
 * The function as production has it (0273's, by pg_get_functiondef), with
 * one clause after the Owner's pass. Nothing else in it is changed, and
 * for an account that is not blocked every answer is what it was.
 */
create or replace function public.may(uid uuid, cap text, dept uuid default null, svc uuid default null, who uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
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

  -- A blocked account may do nothing (0279). The Data API already turns
  -- it away at the door; this is for what does not come through that door
  -- with the person's own name on it: an edge function asking on their
  -- behalf, a file in storage, a list of who to tell. Never the Owner,
  -- who has already passed.
  if exists (select 1 from public.account_blocks k where k.user_id = uid) then
    return false;
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
$function$;

-- ---------------------------------------------------------------------------
-- Storage: no file for a blocked account
-- ---------------------------------------------------------------------------

/*
 * Restrictive: it is asked as well as, never instead of, a bucket's own
 * policies, so it can only take away. Asked once a statement (the two
 * selects), not once a file. Signed-out requests (a visitor's receipt, the
 * church's logo on the sign-in page) are not `authenticated` and never
 * come here.
 */
create policy blocked_accounts_reach_no_files on storage.objects
  as restrictive
  for all to authenticated
  using (not (select public.account_is_blocked((select auth.uid()))))
  with check (not (select public.account_is_blocked((select auth.uid()))));

-- ---------------------------------------------------------------------------
-- Where somebody stands with the app
-- ---------------------------------------------------------------------------

/*
 * 0278's, with one thing more to say: `blocked` is null, or when the
 * block was made. Not who made it and not why — the page says to speak
 * to an Admin, and that conversation is where the reason belongs.
 */
create or replace function public.my_standing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  closure record;
  block jsonb := null;
begin
  if uid is null then
    return jsonb_build_object('closed', null, 'may_enter', true, 'blocked', null);
  end if;

  if public.account_is_blocked(uid) then
    select jsonb_build_object('at', b.blocked_at) into block
      from public.account_blocks b where b.user_id = uid;
  end if;

  -- The one that ends last, if two overlap: that is when the app is back.
  select n.title, n.body, n.closed_from, n.closed_until
    into closure
    from public.app_notices n
   where n.closes_app and n.closed_from <= now() and n.closed_until > now()
   order by n.closed_until desc
   limit 1;

  if not found then
    return jsonb_build_object('closed', null, 'may_enter', true, 'blocked', block);
  end if;

  return jsonb_build_object(
    'closed', jsonb_build_object(
      'title', closure.title,
      'body', closure.body,
      'from', closure.closed_from,
      'until', closure.closed_until
    ),
    'may_enter', public.may(uid, 'app.open_when_closed') or public.may(uid, 'settings.notices'),
    'blocked', block
  );
end;
$$;

revoke all on function public.my_standing() from public, anon;
grant execute on function public.my_standing() to authenticated;

-- ---------------------------------------------------------------------------
-- The hook: a blocked account is turned away
-- ---------------------------------------------------------------------------

/*
 * The function as production has it (0278's, by pg_get_functiondef), with
 * account_is_blocked among the database's own helpers and one refusal
 * more, between the account that is gone and the app that is closed.
 */
create or replace function public.reject_removed_user()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  claims json;
  uid uuid;
  called text;
  -- The database's own helpers: policy predicates, resolvers and the grid.
  -- None of them is an API the app uses; every one answers about whatever
  -- uuid it is handed.
  helpers constant text[] := array[
    'is_admin', 'is_super_admin', 'is_dept_member', 'is_dept_head',
    'is_dept_head_or_assisting', 'is_any_department_head', 'is_on_a_team',
    'is_a_lead', 'has_dept_role', 'can_view_department_content',
    'is_any_coordinator', 'is_rota_coordinator', 'is_service_flow_signer',
    'is_service_coordinator', 'in_household', 'may', 'permission_reach',
    'can_open_page', 'page_level', 'stage_may', 'may_see_poll_voters',
    'poll_department', 'poll_is_open', 'session_service',
    'rota_assignment_user', 'rota_assignment_department',
    'rota_assignment_service', 'checklist_department', 'checklist_service',
    'stage_layout_service', 'service_has_finished', 'availability_is_closed',
    'planner_control', 'is_overwatch', 'overwatch_sees', 'overwatch_may',
    'overwatch_may_write_debrief', 'clock_in_admin', 'may_see_clock_ins',
    'may_approve_clock_ins', 'my_viewable_department_ids',
    'my_signer_service_ids', 'my_readable_assignment_ids',
    'account_is_blocked'
  ];
begin
  -- No claims at all: an unauthenticated request. The sign-in page is one
  -- of those, so this must pass.
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    -- Unparseable claims are not this function's business, and refusing
    -- everything on a surprise here would take the app down. RLS remains
    -- the real gate; let it decide.
    return;
  end;
  if claims is null then return; end if;

  -- The database's own helpers are not the app's. Everyone but the service
  -- role is refused when the request names one of them by path; a policy
  -- that calls the same function never comes this way.
  if coalesce(claims ->> 'role', '') <> 'service_role' then
    called := substring(coalesce(current_setting('request.path', true), '')
                        from '(?:^|/)rpc/([A-Za-z0-9_]+)/?$');
    if called is not null and called = any (helpers) then
      raise insufficient_privilege
        using message = 'That function is the database''s own, not the app''s.',
              detail = 'not_an_rpc';
    end if;
  end if;

  -- Only ordinary signed-in people are checked. `service_role` is the
  -- edge functions and the scheduled jobs, which have no profile and are
  -- not supposed to; `anon` has no identity to remove.
  if coalesce(claims ->> 'role', '') <> 'authenticated' then return; end if;

  uid := auth.uid();
  if uid is null then return; end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise insufficient_privilege
      using message = 'Your account is no longer active.',
            detail = 'account_removed';
  end if;

  -- The account is blocked (0279): one look at a table that is nearly
  -- always empty. my_standing() is let through, as it is below: it is how
  -- the app finds out why it is being refused, and it says nothing else.
  if called is distinct from 'my_standing' and public.account_is_blocked(uid) then
    raise insufficient_privilege
      using message = 'Your account has been blocked by an administrator.',
            detail = 'account_blocked';
  end if;

  -- The app is closed for maintenance (0278). One look at a table that
  -- holds a handful of rows, and may() only while a closure is running.
  -- my_standing() is let through: it is how the app asks why it is being
  -- refused, and it says nothing but that.
  if called is distinct from 'my_standing'
     and exists (
       select 1 from public.app_notices n
        where n.closes_app and n.closed_from <= now() and n.closed_until > now()
     )
     and not (public.may(uid, 'app.open_when_closed') or public.may(uid, 'settings.notices'))
  then
    raise insufficient_privilege
      using message = 'The app is closed for maintenance.',
            detail = 'app_closed';
  end if;
end;
$function$;

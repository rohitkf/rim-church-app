-- Six small gaps a security review found, each closed where it lives.
--
-- 1. Notifications are the recipient's. 0201 let any Admin read every
--    row; the rows carry snippets of prayer and team-chat text that the
--    grid keeps from Admins. The app only ever reads its own.
-- 2. availability.attended could be set on INSERT: the guard ran on
--    UPDATE only (0176/0192). Now an insert that names attended needs the
--    same right (or a clock-in).
-- 3. checklist_items could be inserted already signed off. The guard ran
--    on UPDATE only (0171); an insert now has to start pending, unstamped.
-- 4. purchase_requests could be inserted already decided (decided_by,
--    decided_at, decision_note); the insert policy now says they are empty.
-- 5. team_messages.created_at was the client's. Chat retention keys on it,
--    so a future-dated post never aged out. The server stamps it now, and
--    a mention names each person once and at most twenty people (0170 did
--    this for the board; the team chat had been left out).
-- 6. reject_removed_user's list of the database's own helpers (0279) did
--    not name thirteen uid-taking functions granted to signed-in people,
--    so any member could ask whether the Owner or an Admin holds a right.
--
-- Compatible with the app in production: nothing here takes away
-- something the screens use.

-- 1 ---------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to public
  using (user_id = (select auth.uid()));

-- 2 ---------------------------------------------------------------------
create or replace function public.availability_guard_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('rim.clock_in', true), '') <> '1'
     and (
       (tg_op = 'UPDATE' and new.attended is distinct from old.attended)
       or (tg_op = 'INSERT' and new.attended is not null)
     )
     and not public.may(auth.uid(), 'day.attendance', new.department_id, new.service_id) then
    raise exception 'Only whoever records attendance for this team can mark who came.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists availability_guard_attendance on public.availability;
create trigger availability_guard_attendance
  before insert or update of attended on public.availability
  for each row execute function public.availability_guard_attendance();

-- 3 ---------------------------------------------------------------------
create or replace function public.checklist_item_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.status <> 'pending'
          or new.completed_by is not null or new.completed_at is not null
          or new.verified_by_head is not null or new.verified_by_head_at is not null
          or new.verified_by_coordinator is not null or new.verified_by_coordinator_at is not null) then
    raise exception 'A new task starts pending — it is ticked and signed off afterwards.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.checklist_item_guard_insert() from public, anon, authenticated;

drop trigger if exists checklist_item_guard_insert on public.checklist_items;
create trigger checklist_item_guard_insert
  before insert on public.checklist_items
  for each row execute function public.checklist_item_guard_insert();

-- 4 ---------------------------------------------------------------------
alter policy purchase_requests_insert on public.purchase_requests
  with check (
    requested_by = auth.uid()
    and status = 'requested'
    and decided_by is null and decided_at is null and decision_note is null
    and public.may(auth.uid(), 'inv.purchase_ask', department_id)
  );

-- 5 ---------------------------------------------------------------------
create or replace function public.team_message_stamp_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_at := now();
  end if;
  new.mentions := coalesce(
    array(select distinct m from unnest(new.mentions) as m where m is not null),
    '{}'::uuid[]
  );
  return new;
end;
$$;

revoke all on function public.team_message_stamp_insert() from public, anon, authenticated;

drop trigger if exists team_message_stamp_insert on public.team_messages;
create trigger team_message_stamp_insert
  before insert on public.team_messages
  for each row execute function public.team_message_stamp_insert();

alter table public.team_messages
  add constraint team_messages_mentions_are_few
  check (coalesce(array_length(mentions, 1), 0) <= 20) not valid;

-- 6 ---------------------------------------------------------------------
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
    'account_is_blocked',
    -- 0330: uid-taking helpers granted to signed-in people that no screen calls
    'may_for_every_team', 'may_raise_issue', 'raises_issues_any_time',
    'may_onboard', 'is_team_head', 'is_team_assistant', 'is_a_head',
    'is_an_assistant', 'may_alert_department',
    'can_view_dept_service_metrics', 'may_edit_songs',
    'registration_may_work', 'reception_limited_events'
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
select public.migration_done(330, '0330_a_row_cannot_be_born_already_decided', '4df81d54607d8ad8da4890c41d6ff6b8d3aa2124f3e5456b589998129acfb78f');

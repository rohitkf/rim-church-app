/*
 * A notice for everybody, and a door that closes.
 *
 * The Owner asked for a place in Settings to tell the whole church
 * something that is not a message to anybody in particular: "App
 * maintenance scheduled on 15th Nov. So the app will be disabled for the
 * user until 16th Nov" (November 2026). Send an Alert interrupts people
 * once and is gone; this is the other thing, a line that stands at the top
 * of every page for as long as it is true.
 *
 * So a notice has a kind (information, a warning, maintenance), words, and
 * the time it shows from and until. And because the example ends with the
 * app being disabled, a maintenance notice can do that too: between two
 * times it closes the app to everybody but the people who may keep
 * working, and the same notice has been telling them it would since the
 * day it was written.
 *
 *   settings.notices      write, change and take down notices, and close
 *                         the app with one. The Owner alone out of the box.
 *   app.open_when_closed  use the app while it is closed. Admins out of the
 *                         box; whoever writes notices can always get in, or
 *                         a closure could not be ended by the person who
 *                         began it.
 *
 * Both are rows in the grid like any other (0277): a role's cell, a
 * team's or a person's grant, a block. The Owner passes may() always, so
 * a closure can never shut the Owner out.
 *
 * Closing is the database's, not the app's. reject_removed_user (0070)
 * already runs before every Data API request, to turn away an account
 * that has been removed; it turns away everybody else while a closure is
 * running, with a reason of its own (detail app_closed). The app asks
 * my_standing() to find out why, and shows a page that says so and when
 * the app will be back. The pages a visitor opens from a link (a
 * registration, a ticket) are not signed in and are left alone: an event
 * people have been sent a link to does not stop taking names because the
 * volunteers' app is down.
 */

-- ---------------------------------------------------------------------------
-- Two rows in the grid
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('settings.notices', 'admin', '{none,all}', 'none'),
  ('settings.notices', 'head', '{none,all}', 'none'),
  ('settings.notices', 'assistant', '{none,all}', 'none'),
  ('settings.notices', 'coordinator', '{none,all}', 'none'),
  ('settings.notices', 'member', '{none,all}', 'none'),
  ('settings.notices', 'newcomer', '{none,all}', 'none'),
  ('settings.notices', 'overwatch', '{none,all}', 'none'),
  ('settings.notices', 'pastor', '{none,all}', 'none'),
  ('app.open_when_closed', 'admin', '{none,all}', 'all'),
  ('app.open_when_closed', 'head', '{none,all}', 'none'),
  ('app.open_when_closed', 'assistant', '{none,all}', 'none'),
  ('app.open_when_closed', 'coordinator', '{none,all}', 'none'),
  ('app.open_when_closed', 'member', '{none,all}', 'none'),
  ('app.open_when_closed', 'newcomer', '{none,all}', 'none'),
  ('app.open_when_closed', 'overwatch', '{none,all}', 'none'),
  ('app.open_when_closed', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------------
-- The notices
-- ---------------------------------------------------------------------------

create table public.app_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('info', 'warning', 'maintenance')),
  title text not null,
  body text not null default '',
  -- When it stands at the top of every page. No end is "until it is taken down".
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  -- Somebody who has read a line of information can put it away; a warning
  -- and a closure stay until they are over.
  dismissible boolean not null default true,
  -- The door: between these two times the app is closed to everybody who
  -- may not keep working. A notice shows before it closes anything, which
  -- is the point of it, so these are not the times above.
  closes_app boolean not null default false,
  closed_from timestamptz,
  closed_until timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notices_title_length check (length(btrim(title)) between 1 and 80),
  constraint app_notices_body_length check (length(body) <= 600),
  constraint app_notices_ends_after_it_starts check (ends_at is null or ends_at > starts_at),
  constraint app_notices_only_maintenance_closes check (not closes_app or kind = 'maintenance'),
  constraint app_notices_a_closure_has_both_times check (
    (closes_app and closed_from is not null and closed_until is not null and closed_until > closed_from)
    or (not closes_app and closed_from is null and closed_until is null)
  )
);

comment on table public.app_notices is
  'A line at the top of every page for as long as it is true, and for maintenance a window in which the app is closed (0278).';

-- What the hook looks at before every request: the closures, of which there is rarely one.
create index app_notices_closures_idx on public.app_notices (closed_until) where closes_app;

create trigger app_notices_touch_updated_at
  before update on public.app_notices
  for each row execute function public.touch_updated_at();

alter table public.app_notices enable row level security;

-- Everybody reads what is showing now; whoever writes notices reads the
-- rest too (what is scheduled, what is over).
create policy app_notices_select on public.app_notices
  for select to authenticated
  using (
    (starts_at <= now() and (ends_at is null or ends_at > now()))
    or (select public.may((select auth.uid()), 'settings.notices'))
  );
create policy app_notices_insert on public.app_notices
  for insert to authenticated
  with check (public.may(auth.uid(), 'settings.notices'));
create policy app_notices_update on public.app_notices
  for update to authenticated
  using (public.may(auth.uid(), 'settings.notices'))
  with check (public.may(auth.uid(), 'settings.notices'));
create policy app_notices_delete on public.app_notices
  for delete to authenticated
  using (public.may(auth.uid(), 'settings.notices'));

revoke all on public.app_notices from anon;
revoke truncate on public.app_notices from authenticated;
grant select, insert, update, delete on public.app_notices to authenticated;

-- Screens hear that it changed, as they do for the settings.
create trigger app_notices_live after insert or update or delete on public.app_notices
  for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- Where somebody stands with the app
-- ---------------------------------------------------------------------------

/*
 * Asked by the app when it opens, and again when a request is refused
 * with app_closed. It answers whether the app is closed right now, with
 * the words and the time it reopens, and whether this person may come in
 * anyway. It reads nothing else and takes no argument: it is the one
 * function the hook lets through while the door is shut.
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
begin
  if uid is null then
    return jsonb_build_object('closed', null, 'may_enter', true);
  end if;

  -- The one that ends last, if two overlap: that is when the app is back.
  select n.title, n.body, n.closed_from, n.closed_until
    into closure
    from public.app_notices n
   where n.closes_app and n.closed_from <= now() and n.closed_until > now()
   order by n.closed_until desc
   limit 1;

  if not found then
    return jsonb_build_object('closed', null, 'may_enter', true);
  end if;

  return jsonb_build_object(
    'closed', jsonb_build_object(
      'title', closure.title,
      'body', closure.body,
      'from', closure.closed_from,
      'until', closure.closed_until
    ),
    'may_enter', public.may(uid, 'app.open_when_closed') or public.may(uid, 'settings.notices')
  );
end;
$$;

revoke all on function public.my_standing() from public, anon;
grant execute on function public.my_standing() to authenticated;

-- ---------------------------------------------------------------------------
-- The hook (0070, last 0201): as it stands, and one more reason to refuse
-- ---------------------------------------------------------------------------

create or replace function public.reject_removed_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    'my_signer_service_ids', 'my_readable_assignment_ids'
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
$$;

notify pgrst, 'reload schema';

/*
 * A read rule asks its question once per query, not once per row.
 *
 * After 0200 these tables were still the slow ones to read, each
 * because its read policy called a helper with the row's own team,
 * service or assignment: can_view_department_content(auth.uid(),
 * department_id) on every row of availability, may(...) on every row of
 * availability_history. A security-definer helper cannot be folded into
 * the query, so each call is its own small set of lookups, and they add
 * up: 103 ms to read availability as an ordinary team member, 116 ms to
 * read availability_history, 65 ms to find no checklist progress.
 *
 * The question does not change from row to row. Which teams may this
 * person see is a list of at most eight; which services do they sign off,
 * at most a few dozen. So each helper below works that list out once, for
 * the person asking, and the policy asks whether the row's team or
 * service is on it. Postgres evaluates an uncorrelated `in (select ...)`
 * once and hashes it. Row-independent calls — is_admin, overwatch_sees,
 * auth.uid() itself — are wrapped in `(select ...)` for the same reason.
 *
 * Each list is built from the original helper, row by row of the parent
 * table, so it gives the same answer: every column it is compared with is
 * a foreign key to that parent (department_id to departments, service_id
 * to services, assignment_id to rota_assignments).
 *
 * A list costs the same however few rows are read, and Realtime checks
 * every change one row at a time, for every person watching the table. So
 * a list is only worth it where it is cheap: the signers' services and the
 * readable assignments are worked out with plain joins rather than a
 * helper call per service or per assignment, and a person's own rows are
 * tested first so reading them never builds a list. availability_history
 * and purchase_requests keep their per-row may(): their list would be
 * may() asked of every team, or every team and service, which is dearer
 * than the rows themselves. Only their Overwatch rule, the same for every
 * row, is wrapped. onboarding is left as it is: every page reads only the
 * person's own row, which its rule already answers first, and the whole
 * table is read only by whoever sends the tour.
 *
 * The helpers answer only about the caller (auth.uid() inside, no uid
 * argument), are closed to anon like every read helper (0169), and join
 * the pre-request hook's list so nobody calls them by name (0175).
 *
 * Dry-run on production before applying, as all 44 people and as nobody
 * signed in, counting every row each could read on each of the seven
 * tables touched: the same rows for everybody.
 */

-- ---------------------------------------------------------------------------
-- The lists, worked out once for whoever is asking
-- ---------------------------------------------------------------------------

-- Teams whose content this person may see: can_view_department_content,
-- asked of each team once.
create or replace function public.my_viewable_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.departments d
  where public.can_view_department_content(auth.uid(), d.id);
$$;

-- Services this person signs checklists off for: is_service_flow_signer
-- as a set. On the sign-off team, or heading it, means every service;
-- otherwise the services the rota put them on for that team.
create or replace function public.my_signer_service_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.services s
  where exists (
          select 1 from public.department_members dm
          join public.departments d on d.id = dm.department_id
          where dm.user_id = auth.uid() and d.is_service_flow
        )
     or exists (
          select 1 from public.departments d
          where d.is_service_flow and public.is_dept_head(auth.uid(), d.id)
        )
  union
  select ra.service_id from public.rota_assignments ra
  join public.departments d on d.id = ra.department_id
  where d.is_service_flow and ra.user_id = auth.uid();
$$;

-- Rota assignments whose checklist progress this person may read: the
-- old rota_checklist_progress_select's five tests, each as a set — their
-- own, their teams', the services they sign off, every one for a
-- coordinator (is_any_coordinator), and those in a team they coordinate at
-- that service (is_rota_coordinator).
create or replace function public.my_readable_assignment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.rota_assignments a
  where a.user_id = auth.uid()
     or a.department_id in (select public.my_viewable_department_ids())
     or a.service_id in (select public.my_signer_service_ids())
     or (select public.is_any_coordinator(auth.uid()))
     or (a.service_id, a.department_id) in (
          select m.service_id, m.department_id from public.rota_assignments m
          where m.user_id = auth.uid()
            and lower(btrim(m.role_label)) in ('coordinator', 'team coordinator')
        );
$$;

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'my_viewable_department_ids()', 'my_signer_service_ids()',
    'my_readable_assignment_ids()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $grants$;

-- ---------------------------------------------------------------------------
-- The read policies, asking the lists
-- ---------------------------------------------------------------------------

drop policy if exists availability_select on public.availability;
create policy availability_select on public.availability for select to public
  using (
    user_id = (select auth.uid())
    or department_id in (select public.my_viewable_department_ids())
    or service_id in (select public.my_signer_service_ids())
  );

drop policy if exists availability_history_overwatch_read on public.availability_history;
create policy availability_history_overwatch_read on public.availability_history for select to public
  using ((select public.overwatch_sees((select auth.uid()), 'availability')));

drop policy if exists department_members_select on public.department_members;
create policy department_members_select on public.department_members for select to public
  using (
    -- One's own membership is always visible (is_dept_member); said first
    -- so reading it never builds the list.
    user_id = (select auth.uid())
    or department_id in (select public.my_viewable_department_ids())
  );

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to public
  using (user_id = (select auth.uid()) or (select public.is_admin((select auth.uid()))));

drop policy if exists purchase_requests_overwatch_read on public.purchase_requests;
create policy purchase_requests_overwatch_read on public.purchase_requests for select to public
  using ((select public.overwatch_sees((select auth.uid()), 'inventory')));

drop policy if exists rota_checklist_progress_select on public.rota_checklist_progress;
create policy rota_checklist_progress_select on public.rota_checklist_progress for select to public
  using (assignment_id in (select public.my_readable_assignment_ids()));

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles for select to public
  using (
    user_id = (select auth.uid())
    or (select public.is_admin((select auth.uid())))
    or (
      role_type = any (array['department_head', 'assisting_head']::public.role_type[])
      and department_id is not null
      and department_id in (select public.my_viewable_department_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 0175's hook: the three helpers above are the database's own, not the app's.
-- Unchanged but for those three.
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
end;
$$;

notify pgrst, 'reload schema';

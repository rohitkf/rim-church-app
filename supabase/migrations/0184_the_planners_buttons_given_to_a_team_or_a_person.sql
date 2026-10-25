/*
 * The planner's buttons, given to a team or a person.
 *
 * Everything in a session's menu on the Service Planner — Session started,
 * Not started, Add time, Skip, Assign substitute, Add a session below,
 * Remove — and End service under the running order were all-or-nothing:
 * whoever may plan the running order (`svc.sessions`) or run the service
 * (`svc.manage`) had all of them, and nobody else had any. A church wants
 * the person at the desk on a Sunday to press "Session started" and "Add
 * time" without being able to rename, reorder or delete the plan.
 *
 * So the church can now give some of those buttons, and only those, to a
 * team (everybody on it, and its Heads) or to named people. It lives in
 * `app_settings.planner_controls`, beside every other choice the church
 * makes in Settings, and only an Admin writes it (app_settings_write):
 *
 *   { "teams":  { "<department id>": ["start", "add_time"] },
 *     "people": { "<profile id>":    ["start", "hold", "skip", "end"] } }
 *
 * The controls:
 *   start       Session started            hold      Not started
 *   add_time    Add time                   skip      Skip / Put it back
 *   substitute  Assign substitute          add_below Add a session below
 *   remove      Remove this session        end       End / Reopen service
 *
 * Whoever may plan or run the service keeps every button, as before; this
 * only adds. The database holds it, not the app: each control opens the
 * policy for the rows its button writes, and a guard on each table refuses
 * anything else in the same write. A holder of "Add time" can move start
 * times and grant minutes; they cannot rename a session, change who is on
 * it, or take it out. The guards that are about time stay where they were:
 * nothing in the running order changes once the service is over.
 */

alter table public.app_settings
  add column if not exists planner_controls jsonb not null default '{}'::jsonb;

create or replace function public.planner_controls_is_valid(controls jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(controls) = 'object'
    and pg_column_size(controls) <= 16384
    and not exists (select 1 from jsonb_object_keys(controls) k where k not in ('teams', 'people'))
    and not exists (
      select 1
      from jsonb_each(controls) g(kind, holders)
      where jsonb_typeof(g.holders) <> 'object'
         or exists (
           select 1
           from jsonb_each(g.holders) h(holder, given)
           where h.holder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              or jsonb_typeof(h.given) <> 'array'
              or exists (
                select 1 from jsonb_array_elements(h.given) c
                where jsonb_typeof(c) <> 'string'
                   or c #>> '{}' not in ('start', 'hold', 'add_time', 'skip', 'substitute', 'add_below', 'remove', 'end')
              )
         )
    );
$$;

alter table public.app_settings drop constraint if exists app_settings_planner_controls_valid;
alter table public.app_settings
  add constraint app_settings_planner_controls_valid check (public.planner_controls_is_valid(planner_controls));

comment on column public.app_settings.planner_controls is
  'Service Planner buttons given beyond svc.sessions/svc.manage: {"teams": {dept: [control]}, "people": {profile: [control]}}. Read by planner_control().';

/*
 * Whether the signed-in person holds any of these controls, on their own
 * name or through a team they are on or head. It answers only about the
 * caller, and only from the settings everybody may already read.
 */
create or replace function public.planner_control(variadic controls text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.app_settings s
    where coalesce(s.planner_controls -> 'people' -> (auth.uid()::text), '[]'::jsonb) ?| controls
       or exists (
         select 1
         from jsonb_each(coalesce(s.planner_controls -> 'teams', '{}'::jsonb)) t(team, given)
         where t.given ?| controls
           and (
             public.is_dept_member(auth.uid(), t.team::uuid)
             or public.is_dept_head_or_assisting(auth.uid(), t.team::uuid)
           )
       )
  );
$$;

revoke all on function public.planner_control(text[]) from public, anon;
grant execute on function public.planner_control(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The running order
-- ---------------------------------------------------------------------------

drop policy if exists service_sessions_run on public.service_sessions;
create policy service_sessions_run on public.service_sessions
  for update
  using (
    public.planner_control('start', 'hold', 'add_time', 'skip', 'add_below', 'remove')
    and not public.service_has_finished(service_id)
  )
  with check (
    public.planner_control('start', 'hold', 'add_time', 'skip', 'add_below', 'remove')
    and not public.service_has_finished(service_id)
  );

drop policy if exists service_sessions_add_below on public.service_sessions;
create policy service_sessions_add_below on public.service_sessions
  for insert
  with check (public.planner_control('add_below') and not public.service_has_finished(service_id));

drop policy if exists service_sessions_remove on public.service_sessions;
create policy service_sessions_remove on public.service_sessions
  for delete
  using (public.planner_control('remove') and not public.service_has_finished(service_id));

/*
 * What a control lets through, column by column. A planner, the service
 * role, and the cascade the chain trigger writes (depth > 1, already
 * checked at the top) pass untouched.
 */
create or replace function public.planner_controls_guard_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text;
begin
  if pg_trigger_depth() > 1
     or auth.uid() is null
     or public.may(auth.uid(), 'svc.sessions', null, old.service_id) then
    return new;
  end if;

  for col in
    select n.key
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key)
      and n.key <> 'updated_at'
  loop
    if not case col
      when 'start_time'    then public.planner_control('start', 'hold', 'add_time', 'skip', 'add_below', 'remove')
      when 'skipped_at'    then public.planner_control('start', 'skip')
      when 'skip_reason'   then public.planner_control('start', 'skip')
      when 'held_at'       then public.planner_control('hold')
                                or (new.held_at is null and public.planner_control('start'))
      when 'added_minutes' then public.planner_control('add_time')
      when 'added_grants'  then public.planner_control('add_time')
      when 'order_index'   then public.planner_control('add_below', 'remove')
      else false
    end then
      raise exception 'Changing % is not one of the planner buttons you have been given.', col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.planner_controls_guard_session() from public, anon, authenticated;

drop trigger if exists service_sessions_planner_controls on public.service_sessions;
create trigger service_sessions_planner_controls
  before update on public.service_sessions
  for each row execute function public.planner_controls_guard_session();

-- ---------------------------------------------------------------------------
-- Substitutes
-- ---------------------------------------------------------------------------

-- Only the rows marked as standing by: the people taking the session stay
-- the planner's.
drop policy if exists service_session_assignees_substitute on public.service_session_assignees;
create policy service_session_assignees_substitute on public.service_session_assignees
  for all
  using (
    is_substitute
    and public.planner_control('substitute')
    and not public.service_has_finished(public.session_service(session_id))
  )
  with check (
    is_substitute
    and public.planner_control('substitute')
    and not public.service_has_finished(public.session_service(session_id))
  );

-- ---------------------------------------------------------------------------
-- Ending the service
-- ---------------------------------------------------------------------------

drop policy if exists services_end on public.services;
create policy services_end on public.services
  for update
  using (public.planner_control('end'))
  with check (public.planner_control('end'));

create or replace function public.planner_controls_guard_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1
     or auth.uid() is null
     or public.may(auth.uid(), 'svc.manage') then
    return new;
  end if;
  if (to_jsonb(new) - 'ended_at') is distinct from (to_jsonb(old) - 'ended_at') then
    raise exception 'Only ending or reopening the service is one of the planner buttons you have been given.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.planner_controls_guard_service() from public, anon, authenticated;

drop trigger if exists services_planner_controls on public.services;
create trigger services_planner_controls
  before update on public.services
  for each row execute function public.planner_controls_guard_service();

-- ---------------------------------------------------------------------------
-- planner_control is a policy helper, so it joins 0175's list: the Data
-- API refuses it by name. The rest of the hook is 0175's, unchanged.
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
    'planner_control'
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

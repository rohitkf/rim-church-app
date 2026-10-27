/*
 * Screens hear that a table changed, not what changed.
 *
 * Every live screen (lib/useLiveData.ts, 0168) has listened through
 * Realtime's Postgres Changes: Realtime reads the database's change log
 * for the 77 published tables, and for every change asks the table's read
 * policy, once for each person watching, whether they may see that row.
 * It polls the log for as long as anybody is subscribed, and it was most
 * of what the database did — 15,092 of 18,622 seconds across its forty
 * busiest statements since July. The app never uses what it is sent: it
 * marks the queries that read the table stale and refetches them, through
 * their own policies.
 *
 * So the database says only which table moved, the way Prayer already
 * does (0199): one statement-level trigger per table sends
 * {"table": "<name>"} on the private topic `live`, which anybody signed
 * in may listen to. One message per statement rather than per row, with
 * nothing in it a policy would have to be asked about.
 *
 * The bell is the exception: when the app is in the background it shows
 * the notification itself, so it needs the row. Each new notification is
 * sent, as it is inserted, on its owner's private topic
 * `notifications:<user id>`, and only that person may listen to it.
 *
 * This migration only adds. The tables stay in the publication until the
 * app that listens to `live` is released, so screens already open keep
 * working; 0203 takes them out after that release.
 *
 * A write never fails for want of telling the screens: Realtime is not in
 * every database this runs in (CI's bare Postgres), and the sends swallow
 * their own errors.
 */

-- ---------------------------------------------------------------------------
-- "This table changed", once per statement
-- ---------------------------------------------------------------------------

create or replace function public.live_table_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'live', true);
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function public.live_table_changed() from public, anon, authenticated;

do $live$
declare
  t text;
begin
  foreach t in array array[
    'activity', 'announcements', 'app_feedback', 'app_settings',
    'attendance', 'availability', 'availability_change_requests',
    'availability_history', 'checklist_items', 'checklists',
    'church_events', 'church_updates', 'clock_in_history', 'clock_in_place',
    'clock_in_requests', 'clock_ins', 'department_call_times',
    'department_guests', 'department_members', 'department_permissions',
    'department_role_checklist_items', 'department_role_groups',
    'department_roles', 'departments', 'family_link_requests',
    'giving_bank_accounts', 'giving_links', 'giving_page',
    'guest_availability', 'guest_availability_history',
    'guest_rota_assignments', 'guests', 'household_members', 'households',
    'inventory_categories', 'inventory_documents', 'inventory_events',
    'inventory_items', 'invitations', 'messages', 'notifications',
    'onboarding', 'ownership_transfers', 'profiles', 'purchase_requests',
    'role_permissions', 'rota_assignment_tags', 'rota_assignments',
    'rota_checklist_progress', 'rota_release_requests', 'rota_tags',
    'service_debrief_items', 'service_debriefs', 'service_issues',
    'service_series', 'service_session_assignees', 'service_sessions',
    'service_team_readiness', 'service_template_sessions',
    'service_templates', 'services', 'set_list_items', 'stage_areas',
    'stage_blocks', 'stage_comments', 'stage_layout_log', 'stage_layouts',
    'stage_move_requests', 'stage_team_access', 'stage_template_requests',
    'stage_templates', 'team_join_requests', 'team_messages',
    'team_poll_options', 'team_poll_votes', 'team_polls', 'user_roles'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_live', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each statement execute function public.live_table_changed()',
      t || '_live', t
    );
  end loop;
end $live$;

-- ---------------------------------------------------------------------------
-- The bell's own row, to its owner alone
-- ---------------------------------------------------------------------------

create or replace function public.notification_to_its_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('type', new.type, 'reference_id', new.reference_id, 'body', new.body),
      'inserted',
      'notifications:' || new.user_id::text,
      true
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function public.notification_to_its_owner() from public, anon, authenticated;

drop trigger if exists notifications_to_owner on public.notifications;
create trigger notifications_to_owner after insert on public.notifications
  for each row execute function public.notification_to_its_owner();

-- ---------------------------------------------------------------------------
-- Who may listen
-- ---------------------------------------------------------------------------

do $listen$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;
  drop policy if exists live_listens on realtime.messages;
  create policy live_listens on realtime.messages
    for select to authenticated
    using (realtime.topic() = 'live' and realtime.messages.extension = 'broadcast');
  drop policy if exists notifications_listen on realtime.messages;
  create policy notifications_listen on realtime.messages
    for select to authenticated
    using (
      realtime.topic() = 'notifications:' || (select auth.uid())::text
      and realtime.messages.extension = 'broadcast'
    );
end $listen$;

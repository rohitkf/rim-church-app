/*
 * The church decides who sees what, and for how long.
 *
 * Three things that were written into the app become settings an Admin
 * changes from Settings (docs/configuration.md is the full map):
 *
 *   1. page_access — which profile may open each page. A page key maps to
 *      the lowest level that may open it: 'everyone' (anybody signed in),
 *      'team' (on a team), 'leads' (Head or Assisting Head of a team) or
 *      'admins'. Admins always may. A missing key is the page's default,
 *      and every default is exactly what the app did before this
 *      migration, so applying it changes nobody's access.
 *
 *   2. Retention — how long notifications, team chat, Church Updates,
 *      polls and the record of sent alerts are kept. Null is "for ever",
 *      the default for each, so applying it deletes nothing. One nightly
 *      job does the deleting.
 *
 *   3. display — preferences only the screens read (how many service days
 *      the Dashboard lists, whether folded sections start open). One JSON
 *      object, validated by the app; the database only insists it is one.
 *
 * Who may write any of it is unchanged: the app_settings update policy,
 * which only an Admin passes.
 */

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

/*
 * Which levels each page may be set to. Only those the policies below can
 * actually honour: the rota's rows are read by Availability and the
 * Checklists too, so the rota can be opened wider but not narrowed below
 * the teams; a page whose data the Dashboard also shows can only be hidden.
 * The app's PAGE_RULES (lib/pageAccess.ts) is the same table, and the two
 * must agree.
 */
create or replace function public.page_access_is_valid(access jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(access) = 'object'
    and pg_column_size(access) <= 4096
    and not exists (
      select 1
      from jsonb_each(access) as e(page, level)
      where jsonb_typeof(e.level) <> 'string'
         or e.level #>> '{}' <> all (
              case e.page
                when 'service-planner' then array['everyone', 'team', 'leads']
                when 'rota'            then array['everyone', 'team']
                when 'set-lists'       then array['everyone', 'team', 'leads']
                when 'debriefs'        then array['team', 'leads']
                when 'messages'        then array['everyone', 'team', 'leads']
                when 'updates'         then array['everyone', 'team', 'leads']
                when 'polls'           then array['everyone', 'team']
                when 'events'          then array['everyone', 'team', 'leads']
                when 'giving'          then array['everyone', 'team', 'leads']
                when 'departments'     then array['everyone', 'team']
                when 'inventory'       then array['team', 'leads']
                else array[]::text[]
              end
            )
    );
$$;

alter table public.app_settings
  add column if not exists page_access jsonb not null default '{}'::jsonb
    check (public.page_access_is_valid(page_access)),
  add column if not exists display jsonb not null default '{}'::jsonb
    check (jsonb_typeof(display) = 'object' and pg_column_size(display) <= 16384),
  add column if not exists notification_retention_days integer
    check (notification_retention_days is null or notification_retention_days between 1 and 3650),
  add column if not exists team_chat_retention_days integer
    check (team_chat_retention_days is null or team_chat_retention_days between 1 and 3650),
  add column if not exists church_update_retention_days integer
    check (church_update_retention_days is null or church_update_retention_days between 1 and 3650),
  add column if not exists poll_retention_days integer
    check (poll_retention_days is null or poll_retention_days between 1 and 3650),
  add column if not exists alert_retention_days integer
    check (alert_retention_days is null or alert_retention_days between 1 and 3650);

/* ------------------------------------------------------------------ *
 * Who may open a page
 * ------------------------------------------------------------------ */

/* Head or Assisting Head of a team — the same people may_raise_issue
   calls leads. */
create or replace function public.is_a_lead(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.user_roles r
    where r.user_id = uid
      and r.role_type in ('department_head', 'assisting_head')
      and r.department_id is not null
  );
$$;

/* The level a page is set to, or its default. */
create or replace function public.page_level(page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.page_access ->> page from public.app_settings s limit 1),
    case page
      when 'service-planner' then 'everyone'
      when 'set-lists'       then 'everyone'
      when 'updates'         then 'everyone'
      when 'polls'           then 'everyone'
      when 'events'          then 'everyone'
      when 'giving'          then 'everyone'
      when 'departments'     then 'everyone'
      else 'team'
    end
  );
$$;

create or replace function public.can_open_page(uid uuid, page text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or case public.page_level(page)
      when 'everyone' then true
      when 'team'     then public.is_on_a_team(uid)
      when 'leads'    then public.is_a_lead(uid)
      else false
    end
  );
$$;

grant execute on function public.can_open_page(uuid, text) to authenticated;
grant execute on function public.page_level(text) to authenticated;
grant execute on function public.is_a_lead(uuid) to authenticated;

/* ------------------------------------------------------------------ *
 * The policies that obey it
 *
 * Altered in place rather than dropped and remade, so there is never a
 * moment in which a table has no select policy at all.
 *
 * Each `(select …)` is evaluated once per query rather than once per row.
 * At every default, each returns exactly the rows it returned before:
 * 'team' is is_on_a_team, 'everyone' is auth.uid() is not null.
 * ------------------------------------------------------------------ */

-- Messages: the board is the only page that reads it.
alter policy messages_select on public.messages
  using ((select public.can_open_page(auth.uid(), 'messages')));

-- Inventory: four tables, one page.
alter policy inventory_items_select on public.inventory_items
  using ((select public.can_open_page(auth.uid(), 'inventory')));
alter policy inventory_events_select on public.inventory_events
  using ((select public.can_open_page(auth.uid(), 'inventory')));
alter policy inventory_documents_select on public.inventory_documents
  using ((select public.can_open_page(auth.uid(), 'inventory')));
alter policy inventory_categories_select on public.inventory_categories
  using (
    (select public.can_open_page(auth.uid(), 'inventory'))
    and public.can_view_department_content(auth.uid(), department_id)
  );

-- Debriefs.
alter policy service_debriefs_select on public.service_debriefs
  using ((select public.can_open_page(auth.uid(), 'debriefs')));
alter policy service_debrief_items_select on public.service_debrief_items
  using ((select public.can_open_page(auth.uid(), 'debriefs')));

-- The rota and what rides with it. Availability and the Checklists read
-- these rows too, so a team keeps them whatever the rota is set to: the
-- setting can only open them wider.
alter policy rota_assignments_select on public.rota_assignments
  using (
    (select public.is_on_a_team(auth.uid()))
    or (select public.can_open_page(auth.uid(), 'rota'))
  );
alter policy department_call_times_select on public.department_call_times
  using (
    (select public.is_on_a_team(auth.uid()))
    or (select public.can_open_page(auth.uid(), 'rota'))
  );
alter policy service_team_readiness_select on public.service_team_readiness
  using (
    (select public.is_on_a_team(auth.uid()))
    or (select public.can_open_page(auth.uid(), 'rota'))
  );

-- Church Updates, Events, Giving.
alter policy church_updates_select on public.church_updates
  using ((select public.can_open_page(auth.uid(), 'updates')));
alter policy church_events_select on public.church_events
  using ((select public.can_open_page(auth.uid(), 'events')));
alter policy giving_page_select on public.giving_page
  using ((select public.can_open_page(auth.uid(), 'giving')));
alter policy giving_links_select on public.giving_links
  using ((select public.can_open_page(auth.uid(), 'giving')));
alter policy giving_bank_accounts_select on public.giving_bank_accounts
  using ((select public.can_open_page(auth.uid(), 'giving')));

-- Polls: still only the ones addressed to you, and now only if the page
-- is open to you at all. Options and votes follow the poll.
alter policy team_polls_select on public.team_polls
  using (
    public.poll_is_for_me(audience, department_id, service_id, recipient_ids, created_by)
    and (select public.can_open_page(auth.uid(), 'polls'))
  );

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
      and public.poll_is_for_me(p.audience, p.department_id, p.service_id, p.recipient_ids, p.created_by)
  );
$$;

/* ------------------------------------------------------------------ *
 * How long things are kept
 * ------------------------------------------------------------------ */

create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings%rowtype;
begin
  select * into s from public.app_settings limit 1;
  if not found then
    return;
  end if;

  if s.notification_retention_days is not null then
    delete from public.notifications
    where created_at < now() - make_interval(days => s.notification_retention_days);
  end if;

  if s.team_chat_retention_days is not null then
    delete from public.team_messages
    where created_at < now() - make_interval(days => s.team_chat_retention_days);
  end if;

  -- A pinned update is one the church has said it wants kept up.
  if s.church_update_retention_days is not null then
    delete from public.church_updates
    where not pinned
      and created_at < now() - make_interval(days => s.church_update_retention_days);
  end if;

  -- From when it closed; a poll that never closes, from when it was made.
  if s.poll_retention_days is not null then
    delete from public.team_polls
    where coalesce(closes_at, created_at) < now() - make_interval(days => s.poll_retention_days);
  end if;

  if s.alert_retention_days is not null then
    delete from public.announcements
    where created_at < now() - make_interval(days => s.alert_retention_days);
  end if;
end;
$$;

revoke all on function public.apply_retention() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'apply-retention') then
      perform cron.schedule(
        'apply-retention',
        '0 3 * * *',
        $cron$ select public.apply_retention(); $cron$
      );
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

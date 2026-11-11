/*
 * Nothing in Settings is fixed.
 *
 * Settings grew up room by room, and each room was somebody's by standing:
 * twelve an Admin's, four the Owner's. The grid in Access & Privileges said
 * so in as many words — two whole areas marked Fixed, and a line under the
 * rest: "whoever could change these could hand themselves everything else,
 * so they stay with the Owner and Admins". Pages said the same: Availability,
 * Checklists, Team Chat, Songs and Volunteers had one level each and no
 * choice.
 *
 * The Owner has asked for all of it to be the church's to set — by role, by
 * team, by person — and to decide for themselves who is trusted with what
 * (November 2026). So every one of those is a row in the grid now, read by
 * may() like any other: a role's cell, a team's or a person's grant, a block.
 * Every default reproduces what was fixed, so nothing changes for anybody
 * until a cell is changed. The Owner still passes may() always, which is how
 * a wrong setting gets put right — and why none of this can lock the Owner
 * out.
 *
 * PART A — the rooms, the keys, and what was the Owner's alone
 *   settings.<room>      twelve rooms of Settings. The settings row is
 *                        guarded column by column: each column belongs to a
 *                        room, and changing it needs that room.
 *   app.permissions      the grid itself: every cell a choice (was: every
 *                        Admin, nobody else).
 *   people.roles         making somebody a Head, Assisting Head, Overwatch,
 *                        Pastor or Service Flow Coordinator.
 *   people.admins        making somebody an Admin.
 *   people.unadmin       taking Admin from somebody else (was the Owner's).
 *   feedback.send        sending feedback (was: anybody on a team).
 *   feedback.manage      reading and answering everybody's (the Owner's).
 *   people.contacts      everybody's email, phone and household (the Owner's).
 *   people.compliance    everybody's visa and DBS details (the Owner's).
 *   prayer.*             a Pastor's three cells: a choice, starting at Yes.
 *   a room's own rights  whoever holds a room may give out what the room is
 *                        for (permission_room): the Clock in room's holder,
 *                        who sees the clock-ins; the Prayer room's, who reads
 *                        private requests; the Stage room's, who may draw;
 *                        Page by Page's, the planner's buttons; the Overwatch
 *                        room's, the five things Overwatch does as itself.
 *
 * PART B — every page's opening is a choice
 *   page.availability, page.checklists, page.team_chat, page.songs,
 *   page.volunteers: new rows. can_open_page() already asks may() for any
 *   page in the catalog, so these need no new function.
 *   page.rota, page.polls, page.departments, page.prayer: their Admin, Head,
 *   Assisting Head and Team Member cells become a choice, starting at Yes.
 *
 * What stays as it is, because a choice there would be untrue: handing over
 * ownership (it is the Owner's to give, and the receiver's to accept), the
 * Owner's own Admin role, the Dashboard (where everybody lands), and your own
 * things — your profile, your answers, your own feedback.
 */

-- ===========================================================================
-- The catalog
-- ===========================================================================

-- The rooms of Settings: each its own row. Admins hold the church's rooms out
-- of the box, as they did by standing; nobody but the Owner holds the four
-- that were the Owner's.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('settings.general', 'admin', '{none,all}', 'all'),
  ('settings.general', 'head', '{none,all}', 'none'),
  ('settings.general', 'assistant', '{none,all}', 'none'),
  ('settings.general', 'coordinator', '{none,all}', 'none'),
  ('settings.general', 'member', '{none,all}', 'none'),
  ('settings.general', 'newcomer', '{none,all}', 'none'),
  ('settings.general', 'overwatch', '{none,all}', 'none'),
  ('settings.general', 'pastor', '{none,all}', 'none'),
  ('settings.menu', 'admin', '{none,all}', 'all'),
  ('settings.menu', 'head', '{none,all}', 'none'),
  ('settings.menu', 'assistant', '{none,all}', 'none'),
  ('settings.menu', 'coordinator', '{none,all}', 'none'),
  ('settings.menu', 'member', '{none,all}', 'none'),
  ('settings.menu', 'newcomer', '{none,all}', 'none'),
  ('settings.menu', 'overwatch', '{none,all}', 'none'),
  ('settings.menu', 'pastor', '{none,all}', 'none'),
  ('settings.pages', 'admin', '{none,all}', 'all'),
  ('settings.pages', 'head', '{none,all}', 'none'),
  ('settings.pages', 'assistant', '{none,all}', 'none'),
  ('settings.pages', 'coordinator', '{none,all}', 'none'),
  ('settings.pages', 'member', '{none,all}', 'none'),
  ('settings.pages', 'newcomer', '{none,all}', 'none'),
  ('settings.pages', 'overwatch', '{none,all}', 'none'),
  ('settings.pages', 'pastor', '{none,all}', 'none'),
  ('settings.rota', 'admin', '{none,all}', 'all'),
  ('settings.rota', 'head', '{none,all}', 'none'),
  ('settings.rota', 'assistant', '{none,all}', 'none'),
  ('settings.rota', 'coordinator', '{none,all}', 'none'),
  ('settings.rota', 'member', '{none,all}', 'none'),
  ('settings.rota', 'newcomer', '{none,all}', 'none'),
  ('settings.rota', 'overwatch', '{none,all}', 'none'),
  ('settings.rota', 'pastor', '{none,all}', 'none'),
  ('settings.stage', 'admin', '{none,all}', 'all'),
  ('settings.stage', 'head', '{none,all}', 'none'),
  ('settings.stage', 'assistant', '{none,all}', 'none'),
  ('settings.stage', 'coordinator', '{none,all}', 'none'),
  ('settings.stage', 'member', '{none,all}', 'none'),
  ('settings.stage', 'newcomer', '{none,all}', 'none'),
  ('settings.stage', 'overwatch', '{none,all}', 'none'),
  ('settings.stage', 'pastor', '{none,all}', 'none'),
  ('settings.clockin', 'admin', '{none,all}', 'all'),
  ('settings.clockin', 'head', '{none,all}', 'none'),
  ('settings.clockin', 'assistant', '{none,all}', 'none'),
  ('settings.clockin', 'coordinator', '{none,all}', 'none'),
  ('settings.clockin', 'member', '{none,all}', 'none'),
  ('settings.clockin', 'newcomer', '{none,all}', 'none'),
  ('settings.clockin', 'overwatch', '{none,all}', 'none'),
  ('settings.clockin', 'pastor', '{none,all}', 'none'),
  ('settings.prayer', 'admin', '{none,all}', 'all'),
  ('settings.prayer', 'head', '{none,all}', 'none'),
  ('settings.prayer', 'assistant', '{none,all}', 'none'),
  ('settings.prayer', 'coordinator', '{none,all}', 'none'),
  ('settings.prayer', 'member', '{none,all}', 'none'),
  ('settings.prayer', 'newcomer', '{none,all}', 'none'),
  ('settings.prayer', 'overwatch', '{none,all}', 'none'),
  ('settings.prayer', 'pastor', '{none,all}', 'none'),
  ('settings.overwatch', 'admin', '{none,all}', 'all'),
  ('settings.overwatch', 'head', '{none,all}', 'none'),
  ('settings.overwatch', 'assistant', '{none,all}', 'none'),
  ('settings.overwatch', 'coordinator', '{none,all}', 'none'),
  ('settings.overwatch', 'member', '{none,all}', 'none'),
  ('settings.overwatch', 'newcomer', '{none,all}', 'none'),
  ('settings.overwatch', 'overwatch', '{none,all}', 'none'),
  ('settings.overwatch', 'pastor', '{none,all}', 'none'),
  ('settings.logo', 'admin', '{none,all}', 'none'),
  ('settings.logo', 'head', '{none,all}', 'none'),
  ('settings.logo', 'assistant', '{none,all}', 'none'),
  ('settings.logo', 'coordinator', '{none,all}', 'none'),
  ('settings.logo', 'member', '{none,all}', 'none'),
  ('settings.logo', 'newcomer', '{none,all}', 'none'),
  ('settings.logo', 'overwatch', '{none,all}', 'none'),
  ('settings.logo', 'pastor', '{none,all}', 'none'),
  ('settings.video', 'admin', '{none,all}', 'none'),
  ('settings.video', 'head', '{none,all}', 'none'),
  ('settings.video', 'assistant', '{none,all}', 'none'),
  ('settings.video', 'coordinator', '{none,all}', 'none'),
  ('settings.video', 'member', '{none,all}', 'none'),
  ('settings.video', 'newcomer', '{none,all}', 'none'),
  ('settings.video', 'overwatch', '{none,all}', 'none'),
  ('settings.video', 'pastor', '{none,all}', 'none'),
  ('settings.feedback', 'admin', '{none,all}', 'none'),
  ('settings.feedback', 'head', '{none,all}', 'none'),
  ('settings.feedback', 'assistant', '{none,all}', 'none'),
  ('settings.feedback', 'coordinator', '{none,all}', 'none'),
  ('settings.feedback', 'member', '{none,all}', 'none'),
  ('settings.feedback', 'newcomer', '{none,all}', 'none'),
  ('settings.feedback', 'overwatch', '{none,all}', 'none'),
  ('settings.feedback', 'pastor', '{none,all}', 'none'),
  ('settings.erase', 'admin', '{none,all}', 'none'),
  ('settings.erase', 'head', '{none,all}', 'none'),
  ('settings.erase', 'assistant', '{none,all}', 'none'),
  ('settings.erase', 'coordinator', '{none,all}', 'none'),
  ('settings.erase', 'member', '{none,all}', 'none'),
  ('settings.erase', 'newcomer', '{none,all}', 'none'),
  ('settings.erase', 'overwatch', '{none,all}', 'none'),
  ('settings.erase', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The keys: the grid itself, and who is given a role. Every Admin out of the
-- box, as before; taking Admin from somebody else was the Owner's alone and
-- starts as nobody's.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('app.permissions', 'admin', '{none,all}', 'all'),
  ('app.permissions', 'head', '{none,all}', 'none'),
  ('app.permissions', 'assistant', '{none,all}', 'none'),
  ('app.permissions', 'coordinator', '{none,all}', 'none'),
  ('app.permissions', 'member', '{none,all}', 'none'),
  ('app.permissions', 'newcomer', '{none,all}', 'none'),
  ('app.permissions', 'overwatch', '{none,all}', 'none'),
  ('app.permissions', 'pastor', '{none,all}', 'none'),
  ('people.roles', 'admin', '{none,all}', 'all'),
  ('people.roles', 'head', '{none,all}', 'none'),
  ('people.roles', 'assistant', '{none,all}', 'none'),
  ('people.roles', 'coordinator', '{none,all}', 'none'),
  ('people.roles', 'member', '{none,all}', 'none'),
  ('people.roles', 'newcomer', '{none,all}', 'none'),
  ('people.roles', 'overwatch', '{none,all}', 'none'),
  ('people.roles', 'pastor', '{none,all}', 'none'),
  ('people.admins', 'admin', '{none,all}', 'all'),
  ('people.admins', 'head', '{none,all}', 'none'),
  ('people.admins', 'assistant', '{none,all}', 'none'),
  ('people.admins', 'coordinator', '{none,all}', 'none'),
  ('people.admins', 'member', '{none,all}', 'none'),
  ('people.admins', 'newcomer', '{none,all}', 'none'),
  ('people.admins', 'overwatch', '{none,all}', 'none'),
  ('people.admins', 'pastor', '{none,all}', 'none'),
  ('people.unadmin', 'admin', '{none,all}', 'none'),
  ('people.unadmin', 'head', '{none,all}', 'none'),
  ('people.unadmin', 'assistant', '{none,all}', 'none'),
  ('people.unadmin', 'coordinator', '{none,all}', 'none'),
  ('people.unadmin', 'member', '{none,all}', 'none'),
  ('people.unadmin', 'newcomer', '{none,all}', 'none'),
  ('people.unadmin', 'overwatch', '{none,all}', 'none'),
  ('people.unadmin', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- Feedback, and the two things about people that were the Owner's alone.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('feedback.send', 'admin', '{none,all}', 'all'),
  ('feedback.send', 'head', '{none,all}', 'all'),
  ('feedback.send', 'assistant', '{none,all}', 'all'),
  ('feedback.send', 'coordinator', '{none,all}', 'none'),
  ('feedback.send', 'member', '{none,all}', 'all'),
  ('feedback.send', 'newcomer', '{none,all}', 'none'),
  ('feedback.send', 'overwatch', '{none,all}', 'none'),
  ('feedback.send', 'pastor', '{none,all}', 'none'),
  ('feedback.manage', 'admin', '{none,all}', 'none'),
  ('feedback.manage', 'head', '{none,all}', 'none'),
  ('feedback.manage', 'assistant', '{none,all}', 'none'),
  ('feedback.manage', 'coordinator', '{none,all}', 'none'),
  ('feedback.manage', 'member', '{none,all}', 'none'),
  ('feedback.manage', 'newcomer', '{none,all}', 'none'),
  ('feedback.manage', 'overwatch', '{none,all}', 'none'),
  ('feedback.manage', 'pastor', '{none,all}', 'none'),
  ('people.contacts', 'admin', '{none,all}', 'none'),
  ('people.contacts', 'head', '{none,all}', 'none'),
  ('people.contacts', 'assistant', '{none,all}', 'none'),
  ('people.contacts', 'coordinator', '{none,all}', 'none'),
  ('people.contacts', 'member', '{none,all}', 'none'),
  ('people.contacts', 'newcomer', '{none,all}', 'none'),
  ('people.contacts', 'overwatch', '{none,all}', 'none'),
  ('people.contacts', 'pastor', '{none,all}', 'none'),
  ('people.compliance', 'admin', '{none,all}', 'none'),
  ('people.compliance', 'head', '{none,all}', 'none'),
  ('people.compliance', 'assistant', '{none,all}', 'none'),
  ('people.compliance', 'coordinator', '{none,all}', 'none'),
  ('people.compliance', 'member', '{none,all}', 'none'),
  ('people.compliance', 'newcomer', '{none,all}', 'none'),
  ('people.compliance', 'overwatch', '{none,all}', 'none'),
  ('people.compliance', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- A Pastor's three prayer rows: a choice, starting where they were fixed.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('prayer.pastoral', 'pastor', '{none,all}', 'all'),
  ('prayer.assign', 'pastor', '{none,all}', 'all'),
  ('prayer.lists', 'pastor', '{none,all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The pages that had no choice (PART B, below).

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('page.availability', 'admin', '{none,all}', 'all'),
  ('page.availability', 'head', '{none,all}', 'all'),
  ('page.availability', 'assistant', '{none,all}', 'all'),
  ('page.availability', 'coordinator', '{none}', 'none'),
  ('page.availability', 'member', '{none,all}', 'all'),
  ('page.availability', 'newcomer', '{none}', 'none'),
  ('page.availability', 'pastor', '{none,all}', 'none'),
  ('page.checklists', 'admin', '{none,all}', 'all'),
  ('page.checklists', 'head', '{none,all}', 'all'),
  ('page.checklists', 'assistant', '{none,all}', 'all'),
  ('page.checklists', 'coordinator', '{none}', 'none'),
  ('page.checklists', 'member', '{none,all}', 'all'),
  ('page.checklists', 'newcomer', '{none}', 'none'),
  ('page.checklists', 'pastor', '{none,all}', 'none'),
  ('page.team_chat', 'admin', '{none,all}', 'all'),
  ('page.team_chat', 'head', '{none,all}', 'all'),
  ('page.team_chat', 'assistant', '{none,all}', 'all'),
  ('page.team_chat', 'coordinator', '{none}', 'none'),
  ('page.team_chat', 'member', '{none,all}', 'all'),
  ('page.team_chat', 'newcomer', '{none}', 'none'),
  ('page.team_chat', 'pastor', '{none,all}', 'none'),
  ('page.songs', 'admin', '{none,all}', 'all'),
  ('page.songs', 'head', '{none,all}', 'all'),
  ('page.songs', 'assistant', '{none,all}', 'all'),
  ('page.songs', 'coordinator', '{none}', 'none'),
  ('page.songs', 'member', '{none,all}', 'all'),
  ('page.songs', 'newcomer', '{none,all}', 'all'),
  ('page.songs', 'pastor', '{none,all}', 'none'),
  ('page.volunteers', 'admin', '{none,all}', 'all'),
  ('page.volunteers', 'head', '{none,all}', 'none'),
  ('page.volunteers', 'assistant', '{none,all}', 'none'),
  ('page.volunteers', 'coordinator', '{none}', 'none'),
  ('page.volunteers', 'member', '{none,all}', 'none'),
  ('page.volunteers', 'newcomer', '{none}', 'none'),
  ('page.volunteers', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The four pages a Team Member always opened: their Admin, Head, Assisting
-- Head and Team Member cells become a choice, starting at Yes.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('page.rota', 'admin', '{none,all}', 'all'),
  ('page.rota', 'head', '{none,all}', 'all'),
  ('page.rota', 'assistant', '{none,all}', 'all'),
  ('page.rota', 'member', '{none,all}', 'all'),
  ('page.polls', 'admin', '{none,all}', 'all'),
  ('page.polls', 'head', '{none,all}', 'all'),
  ('page.polls', 'assistant', '{none,all}', 'all'),
  ('page.polls', 'member', '{none,all}', 'all'),
  ('page.departments', 'admin', '{none,all}', 'all'),
  ('page.departments', 'head', '{none,all}', 'all'),
  ('page.departments', 'assistant', '{none,all}', 'all'),
  ('page.departments', 'member', '{none,all}', 'all'),
  ('page.prayer', 'admin', '{none,all}', 'all'),
  ('page.prayer', 'head', '{none,all}', 'all'),
  ('page.prayer', 'assistant', '{none,all}', 'all'),
  ('page.prayer', 'member', '{none,all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ===========================================================================
-- PART A.1 — the settings row, room by room
-- ===========================================================================

-- Which rooms a column of app_settings belongs to: holding any one of them
-- is enough to change it. Null is a column no person sets (the row's own
-- stamps, the mark that the week's call times have gone). A column added
-- later and not named here is Page by Page's, which is where a page's own
-- settings live.
create or replace function public.app_setting_rooms(col text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when col in ('id', 'updated_at', 'updated_by', 'call_time_notice_sent_on') then null
    when col = 'logo_url' then array['settings.logo']
    when col = 'video_tutorial_url' then array['settings.video']
    when col = 'feedback_retention_days' then array['settings.feedback']
    when col in ('timezone', 'notification_keep_count', 'notification_retention_days') then array['settings.general']
    when col = 'nav_layout' then array['settings.menu']
    when col = 'overwatch_pages' then array['settings.overwatch']
    when col = 'coordinator_color' then array['settings.rota']
    when col in ('stage_clear_dow', 'stage_clear_hour') then array['settings.stage', 'settings.pages']
    when col like 'clock\_in\_%' then array['settings.clockin', 'settings.pages']
    when col like 'prayer\_%' then array['settings.prayer', 'settings.pages']
    else array['settings.pages']
  end;
$$;

revoke all on function public.app_setting_rooms(text) from public, anon, authenticated;

-- Whether the caller holds any room that writes the settings row at all.
-- It answers only about whoever is asking, so it is no window onto anybody
-- else (0169) and needs no place among the helpers closed at the door.
create or replace function public.may_change_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.may(auth.uid(), 'settings.pages') or public.may(auth.uid(), 'settings.general')
    or public.may(auth.uid(), 'settings.menu') or public.may(auth.uid(), 'settings.rota')
    or public.may(auth.uid(), 'settings.stage') or public.may(auth.uid(), 'settings.clockin')
    or public.may(auth.uid(), 'settings.prayer') or public.may(auth.uid(), 'settings.overwatch')
    or public.may(auth.uid(), 'settings.logo') or public.may(auth.uid(), 'settings.video')
    or public.may(auth.uid(), 'settings.feedback')
  );
$$;

revoke all on function public.may_change_settings() from public, anon;
grant execute on function public.may_change_settings() to authenticated;

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for update to authenticated
  using ((select public.may_change_settings()))
  with check ((select public.may_change_settings()));

-- The guard: every column that moved is checked against its rooms. One
-- trigger for the whole row, so a new column is guarded the day it is
-- added — the two that guarded the logo and the video link alone go.
create or replace function public.app_settings_guard_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  was jsonb := to_jsonb(old);
  now_ jsonb := to_jsonb(new);
  col text;
  rooms text[];
  room text;
  held boolean;
begin
  -- No session behind the change: a scheduled job, a migration.
  if me is null then
    return new;
  end if;

  for col in select key from jsonb_object_keys(now_) as key loop
    if (now_ -> col) is not distinct from (was -> col) then
      continue;
    end if;
    rooms := public.app_setting_rooms(col);
    if rooms is null then
      continue;
    end if;
    held := false;
    foreach room in array rooms loop
      if public.may(me, room) then
        held := true;
        exit;
      end if;
    end loop;
    if not held then
      raise exception 'Changing that setting is not open to you.'
        using errcode = '42501', detail = col;
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.app_settings_guard_rooms() from public, anon, authenticated;

drop trigger if exists app_settings_guard_rooms on public.app_settings;
create trigger app_settings_guard_rooms
  before update on public.app_settings
  for each row execute function public.app_settings_guard_rooms();

drop trigger if exists app_settings_logo_is_the_owners on public.app_settings;
drop trigger if exists app_settings_video_is_the_owners on public.app_settings;
drop function if exists public.app_settings_logo_is_the_owners();
drop function if exists public.app_settings_video_is_the_owners();

-- ===========================================================================
-- PART A.2 — what each room writes besides the settings row
-- ===========================================================================

-- Team Rota: the tags.
drop policy if exists rota_tags_write_insert on public.rota_tags;
drop policy if exists rota_tags_write_update on public.rota_tags;
drop policy if exists rota_tags_write_delete on public.rota_tags;
create policy rota_tags_write_insert on public.rota_tags for insert to authenticated
  with check (public.may(auth.uid(), 'settings.rota'));
create policy rota_tags_write_update on public.rota_tags for update to authenticated
  using (public.may(auth.uid(), 'settings.rota')) with check (public.may(auth.uid(), 'settings.rota'));
create policy rota_tags_write_delete on public.rota_tags for delete to authenticated
  using (public.may(auth.uid(), 'settings.rota'));

-- Stage Layout: the areas a workspace is made of.
drop policy if exists stage_areas_admin_write_insert on public.stage_areas;
drop policy if exists stage_areas_admin_write_update on public.stage_areas;
drop policy if exists stage_areas_admin_write_delete on public.stage_areas;
create policy stage_areas_write_insert on public.stage_areas for insert to authenticated
  with check (public.may(auth.uid(), 'settings.stage'));
create policy stage_areas_write_update on public.stage_areas for update to authenticated
  using (public.may(auth.uid(), 'settings.stage')) with check (public.may(auth.uid(), 'settings.stage'));
create policy stage_areas_write_delete on public.stage_areas for delete to authenticated
  using (public.may(auth.uid(), 'settings.stage'));

-- Stage Layout: answering a request to keep a layout as a template, and
-- reading the requests waiting.
create or replace function public.decide_stage_template_request(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.stage_template_requests%rowtype;
  final_name text;
begin
  -- Whoever runs the Stage Layout room (0277) — Admins out of the box, as
  -- before — and any Admin, by standing, as before.
  if not (public.is_admin(auth.uid()) or public.may(auth.uid(), 'settings.stage')) then
    raise exception 'Answering a template request is not open to you.' using errcode = '42501';
  end if;
  select * into r from public.stage_template_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'That request has already been answered.' using errcode = '22023';
  end if;

  if p_approve then
    final_name := r.name;
    if exists (select 1 from public.stage_templates t where t.name = final_name) then
      final_name := left(r.name, 54) || ' (' || to_char(now(), 'DD Mon') || ')';
    end if;
    insert into public.stage_templates (name, blocks, created_by)
    values (final_name, r.blocks, r.requested_by)
    on conflict (name) do update set blocks = excluded.blocks, updated_at = now();
  end if;

  update public.stage_template_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_request;

  if r.requested_by is not null and r.requested_by <> auth.uid() then
    insert into public.notifications (user_id, type, reference_id)
    values (r.requested_by, 'stage_template_decided', p_request);
  end if;
end;
$function$;

drop policy if exists stage_template_requests_select on public.stage_template_requests;
create policy stage_template_requests_select on public.stage_template_requests for select to authenticated
  using (
    requested_by = (select auth.uid())
    or (select public.is_admin((select auth.uid())))
    or (select public.may((select auth.uid()), 'settings.stage'))
  );

-- Clock in: where church is. It was one policy for everything, which is
-- also a read policy (0200); it is its commands now.
drop policy if exists clock_in_place_admin on public.clock_in_place;
create policy clock_in_place_select on public.clock_in_place for select to authenticated
  using ((select public.clock_in_admin((select auth.uid()))) or (select public.may((select auth.uid()), 'settings.clockin')));
create policy clock_in_place_insert on public.clock_in_place for insert to authenticated
  with check (public.may(auth.uid(), 'settings.clockin'));
create policy clock_in_place_update on public.clock_in_place for update to authenticated
  using (public.may(auth.uid(), 'settings.clockin')) with check (public.may(auth.uid(), 'settings.clockin'));
create policy clock_in_place_delete on public.clock_in_place for delete to authenticated
  using (public.may(auth.uid(), 'settings.clockin'));

-- App Logo: the file itself. Written `to authenticated`, as every storage
-- policy that asks a signed-in question must be (0271).
drop policy if exists branding_insert on storage.objects;
drop policy if exists branding_update on storage.objects;
drop policy if exists branding_delete on storage.objects;
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.may(auth.uid(), 'settings.logo'));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.may(auth.uid(), 'settings.logo'));
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.may(auth.uid(), 'settings.logo'));

-- Erase Data.
create or replace function public.admin_reset_data(include_setup boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  activity_tables constant text[] := array[
    'rota_release_requests',
    'rota_checklist_progress',
    'rota_assignments',
    'availability',
    'checklist_items',
    'checklists',
    'attendance',
    'service_sessions',
    'department_call_times',
    'services',
    'messages',
    'notifications'
  ];
  setup_tables constant text[] := array[
    'inventory_events',
    'inventory_items',
    'service_template_sessions',
    'service_templates',
    'department_role_checklist_items',
    'department_roles',
    'department_members',
    'departments'
  ];
  t text;
begin
  -- Whoever the grid gives "Erase data" (0277): the Owner out of the box,
  -- and nobody else until the Owner says so.
  if not public.may(auth.uid(), 'settings.erase') then
    raise exception 'Erasing the app''s data is not open to you.' using errcode = '42501';
  end if;

  foreach t in array activity_tables loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('delete from public.%I where ctid is not null', t);
    end if;
  end loop;

  if include_setup then
    foreach t in array setup_tables loop
      if to_regclass('public.' || quote_ident(t)) is not null then
        execute format('delete from public.%I where ctid is not null', t);
      end if;
    end loop;

    -- Everybody but whoever is doing it — and never the Owner, whoever
    -- that is: the one account the app cannot be without.
    delete from auth.users
      where id <> auth.uid() and id not in (select o.user_id from public.app_owner o);
    delete from public.user_roles
      where user_id <> auth.uid() and user_id not in (select o.user_id from public.app_owner o);
  end if;

  insert into public.department_roles (department_id, name)
  select d.id, 'Coordinator' from public.departments d
  on conflict (department_id, name) do nothing;
end;
$function$;

revoke all on function public.admin_reset_data(boolean) from public, anon;
grant execute on function public.admin_reset_data(boolean) to authenticated;

-- ===========================================================================
-- PART A.3 — who is given a role
-- ===========================================================================
-- An Admin's row needs people.admins to give, and people.unadmin (or being
-- its own holder, stepping down) to take away; every other role's row needs
-- people.roles. The Owner's own Admin still cannot be removed at all.

drop policy if exists user_roles_admin_write_insert on public.user_roles;
drop policy if exists user_roles_admin_write_update on public.user_roles;
drop policy if exists user_roles_admin_write_delete on public.user_roles;

create policy user_roles_write_insert on public.user_roles for insert to authenticated
  with check (
    case when role_type = 'admin'
      then public.may(auth.uid(), 'people.admins')
      else public.may(auth.uid(), 'people.roles')
    end
  );

create policy user_roles_write_update on public.user_roles for update to authenticated
  using (
    case when role_type = 'admin'
      then public.may(auth.uid(), 'people.admins')
      else public.may(auth.uid(), 'people.roles')
    end
  )
  with check (
    case when role_type = 'admin'
      then public.may(auth.uid(), 'people.admins')
      else public.may(auth.uid(), 'people.roles')
    end
  );

create policy user_roles_write_delete on public.user_roles for delete to authenticated
  using (
    case when role_type = 'admin'
      then user_id = auth.uid() or public.may(auth.uid(), 'people.unadmin')
      else public.may(auth.uid(), 'people.roles')
    end
  );

create or replace function public.user_roles_guard_admin_removal()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if old.role_type <> 'admin' then
    return old;
  end if;
  -- No session behind the change: a cascade, a scheduled job, a migration.
  if auth.uid() is null then
    return old;
  end if;
  if public.is_super_admin(old.user_id) then
    raise exception 'The owner''s Admin access cannot be removed — transfer ownership first';
  end if;
  -- Their own, stepping down; or whoever the grid gives "Take Admin away"
  -- (0277) — the Owner always, nobody else out of the box.
  if old.user_id = auth.uid() or public.may(auth.uid(), 'people.unadmin') then
    return old;
  end if;
  raise exception 'Taking Admin away from somebody else is not open to you.';
end;
$function$;

create or replace function public.user_roles_guard_admin_edit()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if old.role_type <> 'admin' then
    return new;
  end if;
  if new.role_type = 'admin' and new.user_id = old.user_id then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if public.is_super_admin(old.user_id) then
    raise exception 'The owner''s Admin access cannot be removed — transfer ownership first';
  end if;
  if old.user_id = auth.uid() or public.may(auth.uid(), 'people.unadmin') then
    return new;
  end if;
  raise exception 'Taking Admin away from somebody else is not open to you.';
end;
$function$;

-- Whoever gives roles out, or opens Volunteers, reads who holds which.
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles for select to public
  using (
    user_id = (select auth.uid())
    or (select public.is_admin((select auth.uid())))
    or (select public.may((select auth.uid()), 'people.roles'))
    or (select public.may((select auth.uid()), 'people.admins'))
    -- A row that cannot be read cannot be deleted either.
    or (select public.may((select auth.uid()), 'people.unadmin'))
    or (select public.can_open_page((select auth.uid()), 'volunteers'))
    or (
      role_type = any (array['department_head'::public.role_type, 'assisting_head'::public.role_type])
      and department_id is not null
      and department_id in (select public.my_viewable_department_ids())
    )
  );

-- And who is on which team: it is what the page shows. Their own row, the
-- teams they may see into, or the Volunteers page being open to them.
drop policy if exists department_members_select on public.department_members;
create policy department_members_select on public.department_members for select to public
  using (
    user_id = (select auth.uid())
    or department_id in (select public.my_viewable_department_ids())
    or (select public.can_open_page((select auth.uid()), 'volunteers'))
  );

-- ===========================================================================
-- PART A.4 — feedback
-- ===========================================================================

create or replace function public.submit_feedback(p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  made uuid;
  line text;
begin
  if not public.may(auth.uid(), 'feedback.send') then
    raise exception 'Sending feedback is not open to you.' using errcode = '42501';
  end if;

  insert into public.app_feedback (kind, body, created_by)
  values (p_kind, btrim(p_body), auth.uid())
  returning id into made;

  -- The first line, kept short: it is what a lock screen shows. Whoever
  -- reads the feedback is told — the Owner, and anybody the grid names.
  line := left(split_part(btrim(p_body), E'\n', 1), 140);
  perform public.notify_people(
    coalesce(array(
      select o.user_id from public.app_owner o
      union
      select p.id from public.profiles p where public.may(p.id, 'feedback.manage')
    ), '{}'),
    'feedback_received',
    made,
    initcap(replace(p_kind, '_', ' ')) || ': ' || line
  );
  return made;
end;
$function$;

create or replace function public.mark_feedback(p_id uuid, p_status text, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  was public.app_feedback%rowtype;
  next_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if not public.may(auth.uid(), 'feedback.manage') then
    raise exception 'Answering feedback is not open to you.' using errcode = '42501';
  end if;

  select * into was from public.app_feedback where id = p_id for update;
  if not found then
    raise exception 'That feedback is no longer there.' using errcode = 'P0002';
  end if;

  update public.app_feedback
  set status = p_status,
      reply = next_reply,
      replied_by = case when next_reply is distinct from was.reply then auth.uid() else replied_by end,
      status_changed_at = case when p_status <> was.status then now() else status_changed_at end
  where id = p_id;

  if p_status <> was.status or next_reply is distinct from was.reply then
    perform public.notify_people(
      array[was.created_by],
      'feedback_answered',
      p_id,
      case p_status
        when 'looking' then 'Your feedback is being looked into.'
        when 'done' then 'Your feedback has been dealt with.'
        when 'wont_do' then 'Your feedback has been answered.'
        else 'Your feedback has a reply.'
      end
    );
  end if;
end;
$function$;

drop policy if exists app_feedback_select on public.app_feedback;
create policy app_feedback_select on public.app_feedback for select to authenticated
  using (created_by = (select auth.uid()) or (select public.may((select auth.uid()), 'feedback.manage')));

drop policy if exists app_feedback_delete on public.app_feedback;
create policy app_feedback_delete on public.app_feedback for delete to authenticated
  using ((created_by = auth.uid() and status = 'new') or public.may(auth.uid(), 'feedback.manage'));

-- ===========================================================================
-- PART A.5 — contacts, households and compliance
-- ===========================================================================

create or replace function public.people_contacts(p_ids uuid[] default null)
returns table (id uuid, email text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.may(auth.uid(), 'people.contacts') then
    raise exception 'People''s contact details are not open to you.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.phone
    from public.profiles p
    where p_ids is null or p.id = any (p_ids);
end;
$function$;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated
  using (public.in_household(auth.uid(), id) or (select public.may((select auth.uid()), 'people.contacts')));

drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members for select to authenticated
  using (public.in_household(auth.uid(), household_id) or (select public.may((select auth.uid()), 'people.contacts')));

drop policy if exists family_link_requests_select on public.family_link_requests;
create policy family_link_requests_select on public.family_link_requests for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or (select public.may((select auth.uid()), 'people.contacts')));

drop policy if exists profile_sensitive_select_self_or_admin on public.profile_sensitive;
create policy profile_sensitive_select_self_or_admin on public.profile_sensitive for select to authenticated
  using (user_id = (select auth.uid()) or (select public.may((select auth.uid()), 'people.compliance')));

drop policy if exists profile_sensitive_update_self_or_admin on public.profile_sensitive;
create policy profile_sensitive_update_self_or_admin on public.profile_sensitive for update to authenticated
  using (user_id = auth.uid() or public.may(auth.uid(), 'people.compliance'))
  with check (user_id = auth.uid() or public.may(auth.uid(), 'people.compliance'));

drop policy if exists profile_sensitive_admin_insert on public.profile_sensitive;
create policy profile_sensitive_admin_insert on public.profile_sensitive for insert to authenticated
  with check (public.may(auth.uid(), 'people.compliance'));

drop policy if exists profile_sensitive_admin_delete on public.profile_sensitive;
create policy profile_sensitive_admin_delete on public.profile_sensitive for delete to authenticated
  using (public.may(auth.uid(), 'people.compliance'));

-- ===========================================================================
-- PART A.6 — a room gives out its own rights
-- ===========================================================================
-- The rights a room of Settings lists by team and by person — who sees the
-- clock-ins, who reads private prayer requests, which teams may draw the
-- stage, who presses the planner's buttons — are grants, and giving a grant
-- needed the whole grid. Whoever holds the room may now give out what the
-- room is for, so a room given to somebody is a room they can run. Null is
-- a capability no room holds: the grid's alone.
create or replace function public.permission_room(p_cap text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_cap like 'prayer.%' then 'settings.prayer'
    when p_cap like 'clockin.%' then 'settings.clockin'
    when p_cap like 'stage.%' then 'settings.stage'
    when p_cap like 'planner.%' then 'settings.pages'
  end;
$$;

revoke all on function public.permission_room(text) from public, anon, authenticated;

create or replace function public.set_permission_grants(p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  change jsonb;
  v_cap text;
  v_reach text;
  v_person uuid;
  v_team uuid;
  v_leads boolean;
  v_dated boolean;
  v_until timestamptz;
  -- Whoever may change the grid may give anything a grant can hold.
  v_all boolean := public.may(auth.uid(), 'app.permissions');
begin
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

    -- Anybody else may give only what belongs to a room of Settings they
    -- hold (0277): the Clock in room's holder, who sees the clock-ins.
    if not v_all and not coalesce(public.may(auth.uid(), public.permission_room(v_cap)), false) then
      raise exception 'Giving that out is not open to you.' using errcode = '42501';
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
$function$;

create or replace function public.set_permissions(p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  change jsonb;
  v_role text;
  v_cap text;
  v_reach text;
  v_dept uuid;
  entry public.permission_catalog%rowtype;
  v_all boolean := public.may(auth.uid(), 'app.permissions');
  -- The Overwatch room's holder sets the five things Overwatch does as
  -- itself (0277) — the room's own cells — and nothing else in the grid.
  v_overwatch boolean := public.may(auth.uid(), 'settings.overwatch');
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Send the changes as a list.' using errcode = '22023';
  end if;

  for change in select value from jsonb_array_elements(p_changes) loop
    v_role := change ->> 'role';
    v_cap := change ->> 'capability';
    v_reach := change ->> 'reach';
    v_dept := nullif(change ->> 'department', '')::uuid;

    if not v_all and not (
      v_overwatch and v_dept is null and v_role = 'overwatch'
      and v_cap in ('msg.board_post', 'msg.chat', 'msg.polls', 'issue.as_overwatch', 'debrief.as_overwatch')
    ) then
      raise exception 'Changing that permission is not open to you.' using errcode = '42501';
    end if;

    select * into entry from public.permission_catalog
    where role_key = v_role and capability = v_cap;
    if not found then
      raise exception 'There is no permission % for %.', v_cap, v_role using errcode = '22023';
    end if;

    if v_dept is not null then
      if not exists (select 1 from public.departments d where d.id = v_dept) then
        raise exception 'There is no such team.' using errcode = '22023';
      end if;
      if v_role not in ('head', 'assistant', 'coordinator', 'member') or not ('team' = any(entry.reaches)) then
        raise exception '% is not a team''s to set for %.', v_cap, v_role using errcode = '42501';
      end if;
      if v_reach is null then
        delete from public.department_permissions
        where department_id = v_dept and role_key = v_role and capability = v_cap;
      else
        if v_reach = 'all' or not (v_reach = any(entry.reaches)) then
          raise exception 'A team cannot give % % for %.', v_cap, v_reach, v_role using errcode = '22023';
        end if;
        insert into public.department_permissions (department_id, role_key, capability, reach, updated_by, updated_at)
        values (v_dept, v_role, v_cap, v_reach, auth.uid(), now())
        on conflict (department_id, role_key, capability) do update
          set reach = excluded.reach, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
      end if;
      continue;
    end if;

    if cardinality(entry.reaches) = 1 then
      raise exception '% is fixed for %.', v_cap, v_role using errcode = '42501';
    end if;
    if v_reach is null or not (v_reach = any(entry.reaches)) then
      raise exception '% cannot be given % for %.', v_cap, coalesce(v_reach, 'nothing'), v_role
        using errcode = '22023';
    end if;

    if v_reach = entry.default_reach then
      delete from public.role_permissions where role_key = v_role and capability = v_cap;
    else
      insert into public.role_permissions (role_key, capability, reach, updated_by, updated_at)
      values (v_role, v_cap, v_reach, auth.uid(), now())
      on conflict (role_key, capability) do update
        set reach = excluded.reach, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    end if;
  end loop;
end;
$function$;

-- ===========================================================================
-- PART B — the defaults page_level() falls back on
-- ===========================================================================
-- Asked only for a page with no rows in the catalog, which none of these is
-- any more; kept in step so the two never say different things.
create or replace function public.page_level(page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case page
    when 'service-planner' then 'everyone'
    when 'set-lists'       then 'everyone'
    when 'updates'         then 'everyone'
    when 'polls'           then 'everyone'
    when 'events'          then 'everyone'
    when 'giving'          then 'everyone'
    when 'stage'           then 'everyone'
    when 'prayer'          then 'everyone'
    when 'songs'           then 'everyone'
    -- Volunteers starts as the Admins' alone.
    when 'volunteers'      then 'admins'
    -- Teams, from here on, is for people on a team.
    else 'team'
  end;
$$;

notify pgrst, 'reload schema';

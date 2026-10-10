/*
 * Everything has a clock.
 *
 * What the church decided (October 2026), page by page:
 *
 *   Bell notifications   each person keeps their newest N (default 10).
 *   Team chat            a post lasts 30 days.
 *   Sent-alerts record   clears every Tuesday (alert_clear_dow).
 *   Church Updates       every update has an end time, required; the
 *                        default is a month (church_update_retention_days).
 *                        It is deleted at its end time, pinned or not.
 *   Polls                every poll has a clear time, after its deadline
 *                        if it has one; the default is 7 days after the
 *                        deadline, or after posting (poll_retention_days).
 *   Feedback             Done / Won't do goes 14 days after it is settled.
 *   Services             a service, and everything about it — running
 *                        order, rota, availability, checklist ticks, set
 *                        list, readiness, debriefs, issues of every kind,
 *                        polls about it — goes 14 days after its date
 *                        (service_retention_days). The debrief and issue
 *                        clocks become 14 days too.
 *   Supabase's own logs  the notification-webhook log and the nightly-job
 *                        history keep a week.
 *   Uploads              tighter limits per file, set on the buckets.
 *
 * Inventory, people records (invitations, join requests, guests, events)
 * and settings stay until somebody deletes them.
 *
 * Two existing columns change meaning rather than being replaced, so an
 * app a release behind still reads a number it understands:
 *   church_update_retention_days  now the DEFAULT end for a new update.
 *   poll_retention_days           now the DEFAULT clear for a new poll.
 * alert_retention_days is retired (left in place, unused, kept null): the
 * weekly clear day replaces it.
 */

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

alter table public.app_settings
  add column if not exists notification_keep_count integer not null default 10
    check (notification_keep_count between 5 and 50),
  add column if not exists alert_clear_dow smallint default 2
    check (alert_clear_dow is null or alert_clear_dow between 0 and 6),
  add column if not exists service_retention_days integer not null default 14
    check (service_retention_days between 7 and 365);

update public.app_settings
set team_chat_retention_days = 30,
    feedback_retention_days = 14,
    debrief_retention_days = 14,
    issue_retention_days = 14,
    church_update_retention_days = coalesce(church_update_retention_days, 30),
    poll_retention_days = coalesce(poll_retention_days, 7),
    alert_retention_days = null
where id = true;

alter table public.app_settings
  alter column team_chat_retention_days set default 30,
  alter column feedback_retention_days set default 14,
  alter column debrief_retention_days set default 14,
  alter column issue_retention_days set default 14,
  alter column church_update_retention_days set default 30,
  alter column church_update_retention_days set not null,
  alter column poll_retention_days set default 7,
  alter column poll_retention_days set not null;

alter table public.app_settings
  drop constraint if exists app_settings_church_update_days_is_sane,
  add constraint app_settings_church_update_days_is_sane check (church_update_retention_days between 1 and 365),
  drop constraint if exists app_settings_poll_days_is_sane,
  add constraint app_settings_poll_days_is_sane check (poll_retention_days between 1 and 365);

/* ------------------------------------------------------------------ *
 * Bell notifications: each person's newest N
 * ------------------------------------------------------------------ */

create or replace function public.keep_newest_notifications(p_users uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep integer := coalesce((select notification_keep_count from public.app_settings limit 1), 10);
begin
  delete from public.notifications n
  using (
    select id from (
      select id, row_number() over (partition by user_id order by created_at desc, id desc) as place
      from public.notifications
      where p_users is null or user_id = any (p_users)
    ) ranked
    where place > keep
  ) extra
  where n.id = extra.id;
end;
$$;

revoke all on function public.keep_newest_notifications(uuid[]) from public, anon, authenticated;

create or replace function public.notifications_trim_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.keep_newest_notifications(array(select distinct user_id from new_rows));
  return null;
end;
$$;

revoke all on function public.notifications_trim_after_insert() from public, anon, authenticated;

create or replace trigger notifications_keep_newest
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_trim_after_insert();

/* ------------------------------------------------------------------ *
 * Church Updates: a required end time
 * ------------------------------------------------------------------ */

alter table public.church_updates add column if not exists ends_at timestamptz;

update public.church_updates u
set ends_at = u.created_at + make_interval(days => (select church_update_retention_days from public.app_settings limit 1))
where u.ends_at is null;

create or replace function public.church_update_default_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ends_at is null then
    new.ends_at := coalesce(new.created_at, now())
      + make_interval(days => coalesce((select church_update_retention_days from public.app_settings limit 1), 30));
  end if;
  return new;
end;
$$;

revoke all on function public.church_update_default_end() from public, anon, authenticated;

create or replace trigger church_updates_default_end
  before insert on public.church_updates
  for each row execute function public.church_update_default_end();

alter table public.church_updates
  alter column ends_at set not null,
  drop constraint if exists church_updates_ends_after_posting,
  add constraint church_updates_ends_after_posting check (ends_at > created_at);

create index if not exists church_updates_ends_at_idx on public.church_updates (ends_at);

-- Gone for everybody the moment it ends, not at the next clean-up.
alter policy church_updates_select on public.church_updates
  using ((select public.can_open_page(auth.uid(), 'updates')) and ends_at > now());

drop function if exists public.post_church_update(text, text, boolean);

create or replace function public.post_church_update(
  title text,
  body text,
  pinned boolean,
  ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  made uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can post a church update.' using errcode = '42501';
  end if;
  if title is null or length(btrim(title)) = 0 then
    raise exception 'An update needs a title.';
  end if;
  if body is null or length(btrim(body)) = 0 then
    raise exception 'An update needs something to say.';
  end if;
  if ends_at is not null and ends_at <= now() then
    raise exception 'An update has to end in the future.';
  end if;
  if ends_at is not null and ends_at > now() + interval '366 days' then
    raise exception 'An update can run for a year at most.';
  end if;

  insert into public.church_updates (title, body, pinned, created_by, ends_at)
  values (btrim(title), btrim(body), coalesce(pinned, false), auth.uid(), ends_at)
  returning id into made;

  -- Everybody, in the app and on their phone. The words on the lock screen
  -- are the title; the rest is a tap away.
  perform public.notify_people(
    array(select id from public.profiles),
    'church_update',
    made,
    btrim(title)
  );
  return made;
end;
$$;

revoke all on function public.post_church_update(text, text, boolean, timestamptz) from public, anon;
grant execute on function public.post_church_update(text, text, boolean, timestamptz) to authenticated;

/* ------------------------------------------------------------------ *
 * Polls: a clear time after the deadline
 * ------------------------------------------------------------------ */

alter table public.team_polls add column if not exists clears_at timestamptz;

update public.team_polls p
set clears_at = coalesce(p.closes_at, p.created_at)
  + make_interval(days => (select poll_retention_days from public.app_settings limit 1))
where p.clears_at is null;

create or replace function public.poll_default_clear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clears_at is null then
    new.clears_at := coalesce(new.closes_at, new.created_at, now())
      + make_interval(days => coalesce((select poll_retention_days from public.app_settings limit 1), 7));
  end if;
  return new;
end;
$$;

revoke all on function public.poll_default_clear() from public, anon, authenticated;

create or replace trigger team_polls_default_clear
  before insert on public.team_polls
  for each row execute function public.poll_default_clear();

alter table public.team_polls
  alter column clears_at set not null,
  drop constraint if exists team_polls_clears_after_closing,
  add constraint team_polls_clears_after_closing
    check (clears_at > created_at and (closes_at is null or clears_at >= closes_at));

create index if not exists team_polls_clears_at_idx on public.team_polls (clears_at);

alter policy team_polls_select on public.team_polls
  using (
    public.poll_is_for_me(audience, department_id, service_id, recipient_ids, created_by)
    and (select public.can_open_page(auth.uid(), 'polls'))
    and clears_at > now()
  );

/* ------------------------------------------------------------------ *
 * Join requests: an Admin can clear answered ones
 * ------------------------------------------------------------------ */

drop policy if exists team_join_requests_admin_delete on public.team_join_requests;
create policy team_join_requests_admin_delete on public.team_join_requests for delete
  using (public.is_admin(auth.uid()) and status <> 'pending');

/* ------------------------------------------------------------------ *
 * The clocks
 * ------------------------------------------------------------------ */

-- Hourly: updates past their end, polls past their clear time. The
-- select policies already hide both the moment they pass; this frees
-- the rows.
create or replace function public.expire_timed_posts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.church_updates where ends_at <= now();
  delete from public.team_polls where clears_at <= now();
$$;

revoke all on function public.expire_timed_posts() from public, anon, authenticated;

-- Midnight UTC, daily: the board and feed on their day, the sent-alerts
-- record on its own.
create or replace function public.clear_message_board_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dow integer := extract(dow from (now() at time zone 'utc'))::int;
  s public.app_settings%rowtype;
begin
  select * into s from public.app_settings limit 1;
  if dow = s.board_clear_dow then
    delete from public.notifications where type = 'message';
    delete from public.messages where ctid is not null;
    delete from public.activity where ctid is not null;
  end if;
  if s.alert_clear_dow is not null and dow = s.alert_clear_dow then
    delete from public.announcements where ctid is not null;
  end if;
end;
$$;

revoke all on function public.clear_message_board_if_due() from public, anon, authenticated;

-- 03:00 UTC, daily.
create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings%rowtype;
  today date;
begin
  select * into s from public.app_settings limit 1;
  if not found then
    return;
  end if;
  today := (now() at time zone public.church_timezone())::date;

  -- Services, and with them everything about them (every child table
  -- cascades): running order, rota, availability, ticks, set lists,
  -- readiness, debriefs, issues, the polls about a service.
  delete from public.services
  where date < today - s.service_retention_days;

  if s.notification_retention_days is not null then
    delete from public.notifications
    where created_at < now() - make_interval(days => s.notification_retention_days);
  end if;
  -- In case the cap was lowered since the last insert.
  perform public.keep_newest_notifications(null);

  if s.team_chat_retention_days is not null then
    delete from public.team_messages
    where created_at < now() - make_interval(days => s.team_chat_retention_days);
  end if;

  perform public.expire_timed_posts();

  if s.feedback_retention_days is not null then
    delete from public.app_feedback
    where status in ('done', 'wont_do')
      and coalesce(status_changed_at, created_at) < now() - make_interval(days => s.feedback_retention_days);
  end if;
end;
$$;

revoke all on function public.apply_retention() from public, anon, authenticated;

-- Weekly: Supabase's own logs keep a week.
create or replace function public.prune_platform_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  if to_regclass('supabase_functions.hooks') is not null then
    delete from supabase_functions.hooks where created_at < now() - interval '7 days';
  end if;
end;
$$;

revoke all on function public.prune_platform_logs() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('expire-timed-posts', 'prune-platform-logs');
    perform cron.schedule('expire-timed-posts', '5 * * * *', 'select public.expire_timed_posts();');
    perform cron.schedule('prune-platform-logs', '30 3 * * 2', 'select public.prune_platform_logs();');
  end if;
end $cron$;

/* ------------------------------------------------------------------ *
 * Uploads: tighter limits per file
 * ------------------------------------------------------------------ */

do $buckets$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 2 * 1024 * 1024 where id = 'branding';
    update storage.buckets set file_size_limit = 2 * 1024 * 1024 where id = 'giving';
    update storage.buckets set file_size_limit = 10 * 1024 * 1024 where id = 'handbooks';
    update storage.buckets set file_size_limit = 5 * 1024 * 1024 where id = 'inventory-docs';
    update storage.buckets
      set file_size_limit = 2 * 1024 * 1024,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
      where id = 'avatars';
  end if;
end $buckets$;

notify pgrst, 'reload schema';

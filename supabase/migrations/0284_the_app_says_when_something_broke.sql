/*
 * The app says when something broke.
 *
 * Until now nothing did. A page that failed wrote to that phone's console
 * and nowhere else; the eighteen timed jobs ran 6,751 times in a week
 * with no failure, and nobody would have known had it been otherwise; a
 * push the sender could not deliver was dropped. "The first sign of an
 * outage is a volunteer saying so on a Sunday morning" (the system-design
 * review, November 2026). The Owner chose two things from it: an error
 * log from people's phones, and to be told when something has failed.
 *
 *   client_errors   what went wrong on somebody's device: the message,
 *                   the stack, the page, the build, the device, the
 *                   person. Written only by report_client_error(), which
 *                   anybody may call — a visitor on a registration page
 *                   included, because a page that breaks there loses a
 *                   registration — and which is therefore limited every
 *                   way a flood could come: a person, the visitors
 *                   together, a day, and the table as a whole.
 *   health_events   a timed job that failed, a push the sender could not
 *                   send. The platform keeps its own record of these for
 *                   a day (the jobs) or six hours (the calls); an hourly
 *                   job copies the failures here before they are gone.
 *   settings.health who reads both, in Settings › App Health, and who is
 *                   told: once a day, only when there is something to
 *                   say, a line in the bell (and so on the phone). The
 *                   Owner alone out of the box; a row in the grid like
 *                   any other (0277).
 *   health()        one cheap question a signed-out caller may ask, for
 *                   the check that runs outside (frontend/api/health.js,
 *                   .github/workflows/uptime.yml): a database that is
 *                   down cannot say so itself.
 *
 * Both tables are cleared after thirty days.
 *
 * What this cannot see: a push that reached the sender and was refused by
 * one phone's push service. push-notify answers 200 whatever its devices
 * said; recording that is the push function's own change, which the Owner
 * has not asked for yet.
 */

-- ---------------------------------------------------------------------------
-- The room's row in the grid
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('settings.health', 'admin', '{none,all}', 'none'),
  ('settings.health', 'head', '{none,all}', 'none'),
  ('settings.health', 'assistant', '{none,all}', 'none'),
  ('settings.health', 'coordinator', '{none,all}', 'none'),
  ('settings.health', 'member', '{none,all}', 'none'),
  ('settings.health', 'newcomer', '{none,all}', 'none'),
  ('settings.health', 'overwatch', '{none,all}', 'none'),
  ('settings.health', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------------
-- Errors on people's devices
-- ---------------------------------------------------------------------------

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The same thing again from the same person, on the same page and build,
  -- within the hour, is counted here rather than written again.
  last_at timestamptz not null default now(),
  times integer not null default 1,
  -- Nobody: a visitor on a registration or ticket page.
  user_id uuid references public.profiles(id) on delete set null,
  -- Which net caught it: a page the router gave up on, the boundary above
  -- the router, the browser's own error event, a promise nobody caught, a
  -- read, a save.
  source text not null check (source in ('page', 'boundary', 'window', 'promise', 'query', 'save')),
  message text not null,
  stack text,
  -- The path only, a ticket's code blanked: the code is the key to the ticket.
  page text,
  build text,
  device text,
  installed boolean,
  -- When a bell note last counted it (health_daily_note).
  noted_at timestamptz,
  constraint client_errors_message_length check (length(message) between 1 and 500),
  constraint client_errors_stack_length check (stack is null or length(stack) <= 2000),
  constraint client_errors_page_length check (page is null or length(page) <= 200),
  constraint client_errors_build_length check (build is null or length(build) <= 40),
  constraint client_errors_device_length check (device is null or length(device) <= 200)
);

comment on table public.client_errors is
  'What went wrong on somebody''s device (0284). Written only by report_client_error(); read in Settings › App Health; cleared after thirty days.';

-- The person's own lately (the limit, and the fold), and the room's list.
create index client_errors_person_idx on public.client_errors (user_id, created_at desc);
create index client_errors_recent_idx on public.client_errors (last_at desc);

alter table public.client_errors enable row level security;

-- No insert and no update policy: report_client_error() is the only way in.
create policy client_errors_select on public.client_errors
  for select to authenticated
  using ((select public.may((select auth.uid()), 'settings.health')));
-- Whoever reads them may put away the ones that are dealt with.
create policy client_errors_delete on public.client_errors
  for delete to authenticated
  using ((select public.may((select auth.uid()), 'settings.health')));

revoke all on public.client_errors from anon, authenticated;
grant select, delete on public.client_errors to authenticated;

/*
 * Report one. Answers a short reference — the first eight characters of
 * the row's id — which the page that broke shows, so "it said 7F3K2Q9A" is
 * enough to find it; or null when the report was not kept.
 *
 * Nothing here trusts the caller: every text is cut to what its column
 * holds, the page is cut to its path and a ticket's code is blanked, and
 * four limits stand between a loop (or somebody with the public key and
 * time on their hands) and a full disk:
 *   a person       20 new rows an hour
 *   the visitors   30 new rows an hour, all of them together
 *   a day          500 new rows
 *   the table      5,000 rows, about fifteen megabytes at the very most
 * A report past a limit is dropped quietly. The app must never fail
 * because it could not say that it failed.
 */
create or replace function public.report_client_error(
  p_source text,
  p_message text,
  p_stack text default null,
  p_page text default null,
  p_build text default null,
  p_device text default null,
  p_installed boolean default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_source text := case when p_source in ('page', 'boundary', 'window', 'promise', 'query', 'save') then p_source else 'window' end;
  v_message text := left(btrim(coalesce(p_message, '')), 500);
  v_stack text := nullif(left(btrim(coalesce(p_stack, '')), 2000), '');
  v_page text;
  v_build text := nullif(left(btrim(coalesce(p_build, '')), 40), '');
  v_device text := nullif(left(btrim(coalesce(p_device, '')), 200), '');
  v_id uuid;
  recent integer;
begin
  if v_message = '' then
    return null;
  end if;

  -- The path, nothing after it: a reset link's token rides in the rest.
  v_page := split_part(split_part(btrim(coalesce(p_page, '')), '?', 1), '#', 1);
  v_page := regexp_replace(v_page, '^/ticket/[^/]+', '/ticket/…');
  v_page := nullif(left(v_page, 200), '');

  -- Again, from the same person, on the same page and build, within the hour.
  update public.client_errors e
     set times = least(e.times + 1, 9999), last_at = now()
   where e.id = (
     select c.id
       from public.client_errors c
      where c.user_id is not distinct from uid
        and c.created_at > now() - interval '1 hour'
        and c.message = v_message
        and c.build is not distinct from v_build
        and c.page is not distinct from v_page
      order by c.created_at desc
      limit 1
   )
  returning e.id into v_id;
  if v_id is not null then
    return upper(left(replace(v_id::text, '-', ''), 8));
  end if;

  if uid is not null then
    select count(*) into recent from public.client_errors c
     where c.user_id = uid and c.created_at > now() - interval '1 hour';
    if recent >= 20 then return null; end if;
  else
    select count(*) into recent from public.client_errors c
     where c.user_id is null and c.created_at > now() - interval '1 hour';
    if recent >= 30 then return null; end if;
  end if;

  select count(*) into recent from public.client_errors c where c.created_at > now() - interval '1 day';
  if recent >= 500 then return null; end if;

  select count(*) into recent from public.client_errors;
  if recent >= 5000 then return null; end if;

  insert into public.client_errors (user_id, source, message, stack, page, build, device, installed)
  values (uid, v_source, v_message, v_stack, v_page, v_build, v_device, p_installed)
  returning id into v_id;

  return upper(left(replace(v_id::text, '-', ''), 8));
end;
$$;

comment on function public.report_client_error(text, text, text, text, text, text, boolean) is
  'Record an error from somebody''s device, within limits; answers its reference or null (0284).';

-- A visitor's page can break too.
revoke all on function public.report_client_error(text, text, text, text, text, text, boolean) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What failed in the database's own work
-- ---------------------------------------------------------------------------

create table public.health_events (
  id bigint generated always as identity primary key,
  -- job: a timed job. push: the call that sends a notification to phones.
  -- call: any other request the database made that failed.
  kind text not null check (kind in ('job', 'push', 'call')),
  name text not null,
  at timestamptz not null,
  detail text,
  -- The platform's own id for the run or the answer, so the hourly copy
  -- never writes one twice.
  source_id bigint not null,
  noted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint health_events_once unique (kind, source_id),
  constraint health_events_detail_length check (detail is null or length(detail) <= 500)
);

comment on table public.health_events is
  'A timed job that failed, or a push or other call the database could not make (0284). Copied hourly from the platform''s short-lived logs by health_collect(); cleared after thirty days.';

create index health_events_recent_idx on public.health_events (at desc);

alter table public.health_events enable row level security;

create policy health_events_select on public.health_events
  for select to authenticated
  using ((select public.may((select auth.uid()), 'settings.health')));
create policy health_events_delete on public.health_events
  for delete to authenticated
  using ((select public.may((select auth.uid()), 'settings.health')));

revoke all on public.health_events from anon, authenticated;
grant select, delete on public.health_events to authenticated;

/*
 * Copy what failed out of the platform's logs before they are gone.
 *
 * cron.job_run_details keeps a day (prune_platform_logs), net's answers
 * six hours; this runs every hour. Written in dynamic SQL behind
 * to_regclass, like prune_platform_logs: the schemas are Supabase's, and
 * a database without them (CI's, a fresh local one) has nothing to copy.
 */
create or replace function public.health_collect()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  found integer := 0;
  n integer;
begin
  if to_regclass('cron.job_run_details') is not null then
    execute $q$
      insert into public.health_events (kind, name, at, detail, source_id)
      select 'job',
             coalesce(j.jobname, 'job ' || d.jobid::text),
             coalesce(d.start_time, d.end_time, now()),
             left(nullif(btrim(coalesce(d.return_message, '')), ''), 500),
             d.runid
        from cron.job_run_details d
        left join cron.job j on j.jobid = d.jobid
       where d.status = 'failed'
      on conflict on constraint health_events_once do nothing
    $q$;
    get diagnostics n = row_count;
    found := found + n;
  end if;

  if to_regclass('net._http_response') is not null then
    if to_regclass('supabase_functions.hooks') is not null then
      execute $q$
        insert into public.health_events (kind, name, at, detail, source_id)
        select case when h.hook_name like 'push%' then 'push' else 'call' end,
               coalesce(h.hook_name, 'a background request'),
               coalesce(r.created, now()),
               left(coalesce(
                 nullif(btrim(coalesce(r.error_msg, '')), ''),
                 case when r.timed_out then 'It did not answer in time.' end,
                 case when r.status_code is null then 'It did not answer.' end,
                 'It answered ' || r.status_code::text || coalesce(': ' || nullif(btrim(coalesce(r.content, '')), ''), '')
               ), 500),
               r.id
          from net._http_response r
          left join supabase_functions.hooks h on h.request_id = r.id
         where r.timed_out is true or r.error_msg is not null or r.status_code is null or r.status_code >= 400
        on conflict on constraint health_events_once do nothing
      $q$;
    else
      execute $q$
        insert into public.health_events (kind, name, at, detail, source_id)
        select 'call',
               'a background request',
               coalesce(r.created, now()),
               left(coalesce(
                 nullif(btrim(coalesce(r.error_msg, '')), ''),
                 case when r.timed_out then 'It did not answer in time.' end,
                 case when r.status_code is null then 'It did not answer.' end,
                 'It answered ' || r.status_code::text || coalesce(': ' || nullif(btrim(coalesce(r.content, '')), ''), '')
               ), 500),
               r.id
          from net._http_response r
         where r.timed_out is true or r.error_msg is not null or r.status_code is null or r.status_code >= 400
        on conflict on constraint health_events_once do nothing
      $q$;
    end if;
    get diagnostics n = row_count;
    found := found + n;
  end if;

  return found;
end;
$$;

comment on function public.health_collect() is
  'Copy failed timed jobs and failed calls out of the platform''s logs into health_events; answers how many were new (0284).';

/** Who is told, and who reads the room: the Owner, and whoever the grid gives it. */
create or replace function public.health_watchers()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where public.may(p.id, 'settings.health')
$$;

/*
 * Once a day: if anything failed that nobody has been told about, tell
 * them, in one line. Nothing to say is nothing sent — a note that arrives
 * every morning is a note nobody reads.
 *
 * Errors on devices count as their kinds, and only the new ones: the
 * same message from six phones is one thing to look at, and one that was
 * in an earlier note is not news.
 */
create or replace function public.health_daily_note()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  jobs integer;
  pushes integer;
  calls integer;
  kinds integer;
  parts text[] := '{}';
  said text;
  who uuid;
  told integer := 0;
begin
  perform public.health_collect();

  select count(*) filter (where kind = 'job'),
         count(*) filter (where kind = 'push'),
         count(*) filter (where kind = 'call')
    into jobs, pushes, calls
    from public.health_events
   where noted_at is null;

  select count(*) into kinds
    from (
      select e.message
        from public.client_errors e
       where e.noted_at is null
         and not exists (select 1 from public.client_errors o where o.message = e.message and o.noted_at is not null)
       group by e.message
    ) fresh;

  if jobs + pushes + calls + kinds = 0 then
    -- Nothing new; what was reported again is counted as seen all the same.
    update public.client_errors set noted_at = now() where noted_at is null;
    return 0;
  end if;

  if jobs > 0 then
    parts := parts || (jobs::text || case when jobs = 1 then ' timed job failed' else ' timed jobs failed' end);
  end if;
  if pushes > 0 then
    parts := parts || (pushes::text || case when pushes = 1 then ' notification could not be sent to phones' else ' notifications could not be sent to phones' end);
  end if;
  if calls > 0 then
    parts := parts || (calls::text || case when calls = 1 then ' background request failed' else ' background requests failed' end);
  end if;
  if kinds > 0 then
    parts := parts || (kinds::text || case when kinds = 1 then ' new error on people''s devices' else ' new errors on people''s devices' end);
  end if;

  said := 'App health: ' || array_to_string(parts, ', ') || '. Settings › App Health has the details.';

  for who in select public.health_watchers() loop
    insert into public.notifications (user_id, type, body) values (who, 'health_note', said);
    told := told + 1;
  end loop;

  update public.health_events set noted_at = now() where noted_at is null;
  update public.client_errors set noted_at = now() where noted_at is null;

  return told;
end;
$$;

comment on function public.health_daily_note() is
  'Once a day: one line in the bell of whoever holds settings.health, when a job, a push or a new kind of error has failed since the last (0284).';

create or replace function public.delete_old_health_records()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_errors where last_at < now() - interval '30 days';
  delete from public.health_events where at < now() - interval '30 days';
$$;

/*
 * The room's own reading of how things stand now: each timed job with its
 * runs and failures for as long as the platform's log goes back (a day),
 * what the database has asked the push sender, and the two numbers that
 * say how full the database is. Only for whoever may open the room.
 */
create or replace function public.health_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  jobs jsonb := '[]'::jsonb;
  asked integer := 0;
  answered integer := 0;
  refused integer := 0;
begin
  if not public.may(auth.uid(), 'settings.health') then
    raise exception 'You may not see the app''s health.' using errcode = '42501';
  end if;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', j.jobname,
               'schedule', j.schedule,
               'active', j.active,
               'runs', coalesce(d.runs, 0),
               'failed', coalesce(d.failed, 0),
               'last_at', d.last_at,
               'last_ok', d.last_status is distinct from 'failed'
             ) order by j.jobname), '[]'::jsonb)
        from cron.job j
        left join lateral (
          select count(*)::int as runs,
                 (count(*) filter (where r.status = 'failed'))::int as failed,
                 max(r.start_time) as last_at,
                 (array_agg(r.status order by r.start_time desc))[1] as last_status
            from cron.job_run_details r
           where r.jobid = j.jobid
        ) d on true
    $q$ into jobs;
  end if;

  if to_regclass('supabase_functions.hooks') is not null and to_regclass('net._http_response') is not null then
    execute $q$
      select count(*)::int,
             (count(r.id) filter (where r.status_code between 200 and 299))::int,
             (count(r.id) filter (where r.timed_out is true or r.error_msg is not null or r.status_code is null or r.status_code >= 400))::int
        from supabase_functions.hooks h
        left join net._http_response r on r.id = h.request_id
       where h.created_at > now() - interval '6 hours'
         and h.hook_name like 'push%'
    $q$ into asked, answered, refused;
  end if;

  return jsonb_build_object(
    'at', now(),
    'jobs', jobs,
    'pushes', jsonb_build_object('asked', asked, 'answered', answered, 'failed', refused, 'hours', 6),
    'database', jsonb_build_object(
      'bytes', pg_database_size(current_database()),
      'connections', (select count(*) from pg_stat_activity),
      'connections_max', current_setting('max_connections')::int
    ),
    'errors', jsonb_build_object(
      'day', (select count(*) from public.client_errors where last_at > now() - interval '1 day'),
      'kept', (select count(*) from public.client_errors)
    )
  );
end;
$$;

comment on function public.health_overview() is
  'How things stand now, for Settings › App Health: timed jobs, pushes asked for, the database''s size and connections (0284).';

/*
 * One cheap question from outside: is the database answering? Asked
 * through the public API by frontend/api/health.js, so a yes means the
 * API, its gateway and the database behind it are all up. It says nothing
 * else, on purpose — anybody can ask.
 */
create or replace function public.health()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'at', now())
$$;

comment on function public.health() is
  'Whether the database is answering, for the check that runs outside it (0284).';

revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated;

-- Run by the scheduler, or by definer code, never called from a browser.
revoke all on function public.health_collect() from public, anon, authenticated;
revoke all on function public.health_watchers() from public, anon, authenticated;
revoke all on function public.health_daily_note() from public, anon, authenticated;
revoke all on function public.delete_old_health_records() from public, anon, authenticated;
-- Asks may() itself.
revoke all on function public.health_overview() from public, anon;
grant execute on function public.health_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- The clocks
-- ---------------------------------------------------------------------------

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('health-collect', 'health-daily-note', 'delete-old-health-records');
    -- Hourly: net keeps its answers six hours.
    perform cron.schedule('health-collect', '17 * * * *', 'select public.health_collect()');
    -- A little after seven in the morning, UK winter time.
    perform cron.schedule('health-daily-note', '5 7 * * *', 'select public.health_daily_note()');
    perform cron.schedule('delete-old-health-records', '40 3 * * *', 'select public.delete_old_health_records()');
  end if;
end;
$cron$;

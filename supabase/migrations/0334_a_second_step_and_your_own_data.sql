-- A second step at sign-in, and your own data in your own hands.
--
-- Four things docs/security.md listed as open, which the Owner asked to
-- have done (November 2026).
--
-- 1. A second step. Supabase can ask for a code from an authenticator app
--    after the password, and until now the app had no screen for it. It
--    has one now, and this is the half that makes it mean something: a
--    screen that asks for the code is only the page's word, and the page
--    can be bypassed. So the database asks too. Every request the app
--    makes passes through reject_removed_user() before anything else
--    runs; an account that has set an authenticator up is refused there
--    until its session says the code was given (the token's `aal` claim).
--    One lookup a request, on an indexed table, for accounts that have
--    not given a code; none for those that have.
--
--    Setting it up is each person's choice. Somebody who loses the phone
--    the authenticator is on cannot get in, so the Owner can clear it for
--    them (second_step_clear), and sees who has one (second_step_people).
--    If the Owner loses theirs, it is cleared from Supabase's own
--    dashboard: nobody inside the app outranks the Owner.
--
--    Not covered: storage and realtime do not pass through that function.
--    Files are still behind their own row rules and signed links.
--
-- 2. my_data(): everything held about the person asking, as one answer
--    they can save. Found, not listed: every table whose rows are deleted
--    with an account (a foreign key to the account that cascades) holds
--    rows that are that person's, so a table added later is in the answer
--    the day it is made. Rows that only mention them (a debrief they
--    wrote, an event they added) stay out: those are the church's record,
--    and other people's.
--
-- 3. delete_my_account(): the same removal the Owner does from People,
--    done by the person themselves, on typing their own email address.
--    Not for the Owner, who must hand the app on first, as before.
--
-- 4. privacy_details: who to ask, and anything the church wants said, on
--    the page that tells people what is kept (/privacy). That page is open
--    to anybody, and app_settings is not, so it is read through a function
--    that gives out this one thing.

-- 1 ---------------------------------------------------------------------
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
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    return;
  end;
  if claims is null then return; end if;

  if coalesce(claims ->> 'role', '') <> 'service_role' then
    called := substring(coalesce(current_setting('request.path', true), '')
                        from '(?:^|/)rpc/([A-Za-z0-9_]+)/?$');
    if called is not null and called = any (helpers) then
      raise insufficient_privilege
        using message = 'That function is the database''s own, not the app''s.',
              detail = 'not_an_rpc';
    end if;
  end if;

  if coalesce(claims ->> 'role', '') <> 'authenticated' then return; end if;

  uid := auth.uid();
  if uid is null then return; end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise insufficient_privilege
      using message = 'Your account is no longer active.',
            detail = 'account_removed';
  end if;

  if called is distinct from 'my_standing' and public.account_is_blocked(uid) then
    raise insufficient_privilege
      using message = 'Your account has been blocked by an administrator.',
            detail = 'account_blocked';
  end if;

  -- 0334: an account with an authenticator set up is half signed in until
  -- its code has been given. The token says which (`aal`); the lookup is
  -- only made for a token that has not.
  if called is distinct from 'my_standing'
     and coalesce(claims ->> 'aal', 'aal1') <> 'aal2'
     and exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified')
  then
    raise insufficient_privilege
      using message = 'Enter the code from your authenticator app to finish signing in.',
            detail = 'second_step_needed';
  end if;

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

create or replace function public.second_step_people()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the Owner sees who has a second step.' using errcode = '42501';
  end if;
  return query
    select distinct f.user_id from auth.mfa_factors f where f.status = 'verified';
end;
$function$;

create or replace function public.second_step_clear(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  gone integer;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the Owner can clear somebody''s second step.' using errcode = '42501';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'That account no longer exists.';
  end if;
  delete from auth.mfa_factors where user_id = p_user;
  get diagnostics gone = row_count;
  return gone;
end;
$function$;

revoke all on function public.second_step_people() from public, anon;
revoke all on function public.second_step_clear(uuid) from public, anon;
grant execute on function public.second_step_people() to authenticated;
grant execute on function public.second_step_clear(uuid) to authenticated;

comment on function public.second_step_people() is
  'The accounts that have an authenticator app set up, for the Owner (0334).';
comment on function public.second_step_clear(uuid) is
  'Clears somebody''s authenticator so they can sign in with their password alone again: for a lost phone. The Owner only (0334).';

-- 2 ---------------------------------------------------------------------
create or replace function public.my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  held jsonb := '{}'::jsonb;
  r record;
  found jsonb;
  label text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  -- Every table whose rows go when an account goes: those rows are that
  -- person's. One column at a time, so a table tied to the account twice
  -- (asked by, asked of) is read by each.
  for r in
    select cl.oid::regclass as tbl, cl.relname as name, a.attname as col,
           count(*) over (partition by cl.oid) as ties
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confdeltype = 'c'
       and array_length(c.conkey, 1) = 1
       and n.nspname = 'public'
       and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
       -- The keys a browser was given to receive notifications, and the
       -- database's own bookkeeping: nothing a person gave or would read.
       and cl.relname <> all (array[
         'push_subscriptions', 'registration_order_undos', 'clock_in_reminded',
         'profile_completions', 'reception_event_limits'
       ])
     order by cl.relname, a.attname
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %s t where t.%I = $1',
      r.tbl, r.col
    ) into found using me;
    if found <> '[]'::jsonb then
      label := case when r.ties > 1 then r.name || ' (' || r.col || ')' else r.name end;
      held := held || jsonb_build_object(label, found);
    end if;
  end loop;

  return jsonb_build_object(
    'made_at', now(),
    'about', 'Everything this app holds that is yours: each table whose rows are deleted when your account is.',
    'account', (
      select jsonb_build_object(
        'email', u.email,
        'created_at', u.created_at,
        'email_confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at
      ) from auth.users u where u.id = me
    ),
    'tables', held
  );
end;
$function$;

revoke all on function public.my_data() from public, anon;
grant execute on function public.my_data() to authenticated;
comment on function public.my_data() is
  'Everything held about the person asking, as one answer: every table whose rows are deleted with their account (0334).';

-- 3 ---------------------------------------------------------------------
create or replace function public.delete_my_account(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  addr text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if public.is_super_admin(me) then
    raise exception 'The Owner''s account cannot be removed. Hand the app to somebody else first.';
  end if;
  select email into addr from auth.users where id = me;
  -- Typed, not pressed: the one thing here that cannot be put back.
  if addr is null or lower(btrim(coalesce(p_email, ''))) <> lower(addr) then
    raise exception 'That is not the email address of this account, so nothing was removed.';
  end if;

  -- The invitation that admitted them goes with them, as it does when the
  -- Owner removes somebody (admin_delete_user).
  delete from public.invitations where lower(email) = lower(addr);
  delete from auth.users where id = me;
end;
$function$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
comment on function public.delete_my_account(text) is
  'Removes the account of the person asking, on their typing its email address. Everything that is theirs goes with it. Not the Owner''s (0334).';

-- 4 ---------------------------------------------------------------------
alter table public.app_settings
  add column if not exists privacy_details jsonb not null default '{}'::jsonb;

comment on column public.app_settings.privacy_details is
  'Who to ask about what is kept, and anything the church wants said, shown on /privacy: contact_name, contact_email, postal_address, note (0334).';

-- Whose it is to change: the room that holds the church's own details.
create or replace function public.app_setting_rooms(col text)
returns text[]
language sql
immutable
set search_path = public
as $function$
  select case
    when col in ('id', 'updated_at', 'updated_by', 'call_time_notice_sent_on') then null
    when col = 'logo_url' then array['settings.logo']
    when col = 'video_tutorial_url' then array['settings.video']
    when col = 'feedback_retention_days' then array['settings.feedback']
    when col in ('timezone', 'notification_keep_count', 'notification_retention_days', 'privacy_details') then array['settings.general']
    when col = 'nav_layout' then array['settings.menu']
    when col = 'overwatch_pages' then array['settings.overwatch']
    when col = 'coordinator_color' then array['settings.rota']
    when col in ('stage_clear_dow', 'stage_clear_hour') then array['settings.stage', 'settings.pages']
    when col like 'clock\_in\_%' then array['settings.clockin', 'settings.pages']
    when col like 'prayer\_%' then array['settings.prayer', 'settings.pages']
    else array['settings.pages']
  end;
$function$;

create or replace function public.privacy_details()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce((select s.privacy_details from public.app_settings s where s.id), '{}'::jsonb);
$function$;

create or replace function public.set_privacy_details(p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  clean jsonb := '{}'::jsonb;
  k text;
  v text;
  longest constant jsonb := '{"contact_name": 120, "contact_email": 254, "postal_address": 500, "note": 4000}'::jsonb;
begin
  if not public.may(auth.uid(), 'settings.general') then
    raise exception 'Changing that setting is not open to you.' using errcode = '42501';
  end if;
  -- Four things, each a line or a paragraph of words: nothing else is
  -- kept, because anybody at all can read what is.
  for k in select jsonb_object_keys(longest) loop
    v := btrim(coalesce(p_details ->> k, ''));
    if length(v) > (longest ->> k)::int then
      raise exception 'That is longer than this page can show (% characters at most).', longest ->> k;
    end if;
    if v <> '' then clean := clean || jsonb_build_object(k, v); end if;
  end loop;
  if clean ? 'contact_email' and (clean ->> 'contact_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like an email address.';
  end if;
  update public.app_settings set privacy_details = clean where id;
  return clean;
end;
$function$;

revoke all on function public.privacy_details() from public;
grant execute on function public.privacy_details() to anon, authenticated;
revoke all on function public.set_privacy_details(jsonb) from public, anon;
grant execute on function public.set_privacy_details(jsonb) to authenticated;

comment on function public.privacy_details() is
  'What the church has said about itself for /privacy. Open to anybody, signed in or not: it is the one thing in app_settings that is (0334).';
comment on function public.set_privacy_details(jsonb) is
  'Sets what /privacy says about the church: four pieces of text, trimmed and length-checked. Settings › General (0334).';

notify pgrst, 'reload schema';
select public.migration_done(334, '0334_a_second_step_and_your_own_data', '09fdb408dba86d2f11a86c6428d9e752400a2fb02d7e0d74ded1af80193f539e');

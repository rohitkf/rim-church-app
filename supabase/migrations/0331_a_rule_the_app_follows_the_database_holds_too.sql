-- The leads a security review could not settle from the source alone, closed
-- in the database where the rule can be written in one place. Each is
-- a rule the app already follows; the database now holds it too.
--
--  1. A role's checklist line belongs to the role's team, not whichever
--     team the writer names.
--  2. A stage block cannot be INSERTED already locked, and a layout with
--     a locked block cannot be deleted by a plain DELETE.
--  3. A planner's End button stamps the end itself; it cannot write any
--     time it likes.
--  4. The "call times have gone" mark is the sender's, not a person's.
--  5. Only the Cancel right stamps cancelled_at on a registration event.
--  6. A registration date can point only at the diary row its own sync made.
--  7. An event's series must be one its writer may manage.
--  8. A role cannot be named Coordinator by somebody who could not name
--     a Coordinator.
--  9. A prayer update or an answer tells only those who may still see it.
-- 10. A blocked account stops listening to its notification topic.
-- 11. Two answers to a single-choice poll cannot both stand.
-- 12. Linking a guest to an account adds only the teams the linker may add to.
-- 13. A team invitation is taken up only by a confirmed address.
-- 14. A push subscription is an https address on port 443 with a real
--     host name, and so is checked again before anything is sent.
-- 15. An order takes at most five receipt uploads.
--
-- Compatible with the app in production: each only refuses what a screen
-- never does.

-- 1 ---------------------------------------------------------------------
create or replace function public.role_checklist_item_takes_roles_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.department_id := (select r.department_id from public.department_roles r where r.id = new.role_id);
  if new.department_id is null then
    raise exception 'That role does not exist.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.role_checklist_item_takes_roles_team() from public, anon, authenticated;
drop trigger if exists role_checklist_item_takes_roles_team on public.department_role_checklist_items;
create trigger role_checklist_item_takes_roles_team
  before insert or update of role_id, department_id on public.department_role_checklist_items
  for each row execute function public.role_checklist_item_takes_roles_team();

-- 2 ---------------------------------------------------------------------
create or replace function public.stage_block_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('rim.stage_lock', true), '') <> 'on' then
    if tg_op = 'INSERT' and (new.locked_by is not null or new.locked_at is not null) then
      raise exception 'A lock is set with Lock, not by adding the block locked.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE'
       and (new.locked_by is distinct from old.locked_by or new.locked_at is distinct from old.locked_at) then
      raise exception 'A lock is set with Lock, not by editing the block.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists stage_block_lock_guard on public.stage_blocks;
create trigger stage_block_lock_guard
  before insert or update on public.stage_blocks
  for each row execute function public.stage_block_lock_guard();
revoke all on function public.stage_block_lock_guard() from public, anon, authenticated;

alter policy stage_layouts_delete on public.stage_layouts
  using (
    not public.service_has_finished(service_id)
    and public.stage_may(auth.uid(), 'delete')
    and not exists (select 1 from public.stage_blocks b where b.layout_id = stage_layouts.id and b.locked_at is not null)
  );

-- 3 ---------------------------------------------------------------------
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
  if (to_jsonb(new) - 'ended_at' - 'end_held_at') is distinct from (to_jsonb(old) - 'ended_at' - 'end_held_at') then
    raise exception 'Only ending or reopening the service is one of the planner buttons you have been given.'
      using errcode = '42501';
  end if;
  -- Ending, or holding it open, is a moment, and the moment is the server's.
  if new.ended_at is distinct from old.ended_at and new.ended_at is not null then
    new.ended_at := now();
  end if;
  if new.end_held_at is distinct from old.end_held_at and new.end_held_at is not null then
    new.end_held_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.planner_controls_guard_service() from public, anon, authenticated;

-- 4 ---------------------------------------------------------------------
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
    -- The mark that the week's call times have gone is the sender's, never
    -- a person's (0331): a signed-in change to it is refused.
    if col = 'call_time_notice_sent_on' then
      raise exception 'Changing that setting is not open to you.'
        using errcode = '42501', detail = col;
    end if;
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

-- 5 ---------------------------------------------------------------------
create or replace function public.registration_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.cancelled_at is not null and new.status <> 'closed' then
      raise exception 'A cancelled event cannot be reopened.';
    end if;
    if old.cancelled_at is not null and new.cancelled_at is null then
      raise exception 'A cancelled event stays cancelled.';
    end if;
    -- Cancelling is the Cancel right's, through registration_event_cancel,
    -- which also marks the refunds owed; the Edit right cannot stamp it (0331).
    if old.cancelled_at is null and new.cancelled_at is not null
       and auth.uid() is not null
       and not public.registration_can(auth.uid(), 'cancel') then
      raise exception 'Cancelling events is not one of your rights here.' using errcode = '42501';
    end if;
    -- The link is on posters and in emails from the moment it is published.
    if old.status <> 'draft' and new.slug <> old.slug then
      raise exception 'The link is out, so it cannot change now.';
    end if;
    return new;
  end if;
  -- DELETE: the Owner, or whoever is given "Cancel & delete" — not "Run
  -- registrations" on its own (maintenance with no signed-in user is let through).
  if auth.uid() is not null and not public.registration_can(auth.uid(), 'delete') then
    raise exception 'Deleting events is not one of your rights here. Cancel it instead.' using errcode = '42501';
  end if;
  return old;
end;
$$;

-- 6 ---------------------------------------------------------------------
create or replace function public.registration_event_dates_own_diary_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.diary_event_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.diary_event_id is not distinct from old.diary_event_id then
    return new;
  end if;
  -- Only the row registration_sync_diary made for this caller, with its
  -- Register link, can be pointed at; an existing diary event cannot.
  if not exists (
    select 1 from public.church_events e
     where e.id = new.diary_event_id
       and e.created_by = auth.uid()
       and e.links @> '[{"label": "Register"}]'::jsonb
  ) then
    raise exception 'A date can only point at the diary entry its own registration made.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.registration_event_dates_own_diary_row() from public, anon, authenticated;
drop trigger if exists registration_event_dates_own_diary_row on public.registration_event_dates;
create trigger registration_event_dates_own_diary_row
  before insert or update of diary_event_id on public.registration_event_dates
  for each row execute function public.registration_event_dates_own_diary_row();

-- 7 ---------------------------------------------------------------------
alter policy church_events_insert on public.church_events
  with check (
    created_by = (select auth.uid())
    and public.may_for_every_team((select auth.uid()), 'svc.events', department_ids)
    and (series_id is null or exists (
      select 1 from public.church_event_series s
       where s.id = church_events.series_id
         and public.may_for_every_team((select auth.uid()), 'svc.events', s.department_ids)))
  );
alter policy church_events_update on public.church_events
  using (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids))
  with check (
    public.may_for_every_team((select auth.uid()), 'svc.events', department_ids)
    and (series_id is null or exists (
      select 1 from public.church_event_series s
       where s.id = church_events.series_id
         and public.may_for_every_team((select auth.uid()), 'svc.events', s.department_ids)))
  );

-- 8 ---------------------------------------------------------------------
create or replace function public.role_named_coordinator_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and lower(btrim(new.name)) in ('coordinator', 'team coordinator')
     and (tg_op = 'INSERT' or lower(btrim(old.name)) not in ('coordinator', 'team coordinator'))
     and not (public.is_admin(auth.uid()) or public.is_dept_head_or_assisting(auth.uid(), new.department_id)) then
    raise exception 'Only an Admin, or the team''s Head or Assisting Head, can name a Coordinator role.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.role_named_coordinator_guard() from public, anon, authenticated;
drop trigger if exists role_named_coordinator_guard on public.department_roles;
create trigger role_named_coordinator_guard
  before insert or update of name on public.department_roles
  for each row execute function public.role_named_coordinator_guard();

-- 9 ---------------------------------------------------------------------
create or replace function public.prayer_tell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.prayer_requests%rowtype;
begin
  if tg_table_name = 'prayer_requests' then
    r := new;
    if tg_op = 'INSERT' and r.kind = 'private' then
      -- A private request: the pastors, by name, since they see it anyway.
      insert into public.notifications (user_id, type, reference_id, body)
      select p.id, 'prayer_private', r.id,
        'A private prayer request from '
          || coalesce(nullif((select btrim(first_name || ' ' || last_name) from public.profiles where id = r.author_id), ''), 'somebody')
      from public.profiles p
      where p.id <> r.author_id and public.prayer_pastoral(p.id);
    elsif tg_op = 'UPDATE' and new.status = 'answered' and old.status <> 'answered' then
      -- Answered: whoever was still praying or fasting for it.
      insert into public.notifications (user_id, type, reference_id, body)
      select x.user_id, 'prayer_answered', r.id, 'A prayer answered — praise God! ' || public.prayer_snippet(r.body)
      from public.prayer_responses x
      where x.request_id = r.id and x.kind in ('praying', 'fasting') and x.user_id <> r.author_id
        and public.prayer_may_see(x.user_id, r)
        -- Once: undoing and answering again does not tell them twice.
        and not exists (
          select 1 from public.notifications n
          where n.user_id = x.user_id and n.type = 'prayer_answered' and n.reference_id = r.id
        );
    end if;
  elsif tg_table_name = 'prayer_updates' then
    select * into r from public.prayer_requests where id = new.request_id;
    insert into public.notifications (user_id, type, reference_id, body)
    select x.user_id, 'prayer_update', r.id, 'An update on ' || public.prayer_snippet(r.body) || ': ' || left(new.body, 120)
    from public.prayer_responses x
    where x.request_id = r.id and x.kind in ('praying', 'fasting') and x.user_id <> r.author_id
      and public.prayer_may_see(x.user_id, r);
  end if;
  return null;
end;
$$;

-- 10 --------------------------------------------------------------------
do $listen$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;
  drop policy if exists live_listens on realtime.messages;
  create policy live_listens on realtime.messages
    for select to authenticated
    using (
      realtime.topic() = 'live' and realtime.messages.extension = 'broadcast'
      and not public.account_is_blocked((select auth.uid()))
    );
  drop policy if exists notifications_listen on realtime.messages;
  create policy notifications_listen on realtime.messages
    for select to authenticated
    using (
      realtime.topic() = 'notifications:' || (select auth.uid())::text
      and realtime.messages.extension = 'broadcast'
      and not public.account_is_blocked((select auth.uid()))
    );
end $listen$;

-- 11 --------------------------------------------------------------------
create or replace function public.enforce_single_choice_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select choice_mode from public.team_polls where id = new.poll_id) = 'single' then
    -- One voter, one poll, one at a time: the second waits for the first
    -- to commit and so sees its row to take it away.
    perform pg_advisory_xact_lock(hashtextextended(new.poll_id::text || ':' || new.user_id::text, 0));
    delete from public.team_poll_votes
     where poll_id = new.poll_id
       and user_id = new.user_id
       and option_id <> new.option_id;
  end if;
  return new;
end;
$$;

-- 12 --------------------------------------------------------------------
create or replace function public.guest_joined_moves_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.became_member is null and new.became_member is not null then
    insert into public.department_members (department_id, user_id, member_type)
    select dg.department_id, new.became_member, dg.member_type
    from public.department_guests dg
    where dg.guest_id = new.id
      -- Linking adds a person only to the teams the linker may add people to (0331).
      and (auth.uid() is null or public.may(auth.uid(), 'team.members', dg.department_id))
    on conflict (department_id, user_id) do nothing;

    insert into public.availability (user_id, service_id, department_id, status, note)
    select new.became_member, ga.service_id, ga.department_id, ga.status, ga.note
    from public.guest_availability ga
    where ga.guest_id = new.id
      and not public.service_has_finished(ga.service_id)
    on conflict (user_id, service_id, department_id) do nothing;

    insert into public.rota_assignments (service_id, department_id, user_id, role_label, role_id)
    select gr.service_id, gr.department_id, new.became_member, gr.role_label, gr.role_id
    from public.guest_rota_assignments gr
    where gr.guest_id = new.id
      and not public.service_has_finished(gr.service_id)
      and not exists (
        select 1 from public.rota_assignments ra
        where ra.service_id = gr.service_id and ra.user_id = new.became_member
      );

    delete from public.guest_rota_assignments where guest_id = new.id;
    delete from public.guest_availability where guest_id = new.id;
    delete from public.department_guests where guest_id = new.id;

    -- The sessions they were taking (0293).
    perform public.guest_sessions_move_to_account(new.id, new.became_member);
  end if;
  return new;
end;
$$;

-- 13 --------------------------------------------------------------------
create or replace function public.join_invited_team(uid uuid, addr text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_members (department_id, user_id, member_type)
  select i.department_id, uid, coalesce(i.member_type, 'core'::member_type)
  from public.invitations i
  where uid is not null
    and addr is not null
    and lower(i.email) = lower(addr)
    and i.department_id is not null
    and (i.accepted_at is null
         or i.accepted_at >= (select u.created_at from auth.users u where u.id = uid))
    and exists (select 1 from public.profiles p where p.id = uid)
    -- The address has been confirmed, whatever the sign-in setting (0331).
    and exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null)
  on conflict (department_id, user_id) do nothing;
$$;

-- 14 --------------------------------------------------------------------
create or replace function public.push_endpoint_is_sane(e text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select e ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:443)?(/[^[:space:]]*)?$'
     and e !~ '^https://[0-9.]+(:|/|$)'
     and e !~ '^https://[^/]*\.(local|localhost|internal|lan|home|corp)(:|/|$)'
$$;
revoke all on function public.push_endpoint_is_sane(text) from public, anon;
grant execute on function public.push_endpoint_is_sane(text) to authenticated, service_role;

create or replace function public.push_subscription_endpoint_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.push_endpoint_is_sane(lower(new.endpoint)) then
    raise exception 'That does not look like a push service address.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.push_subscription_endpoint_check() from public, anon, authenticated;
drop trigger if exists push_subscription_endpoint_check on public.push_subscriptions;
create trigger push_subscription_endpoint_check
  before insert or update of endpoint on public.push_subscriptions
  for each row execute function public.push_subscription_endpoint_check();

-- 15 --------------------------------------------------------------------
-- A receipt goes under the order's own code, and now at most five of them
-- (a retry or two, a photo and a PDF), so an open link cannot be used to
-- fill the bucket. Staff who clear the old ones make room again.
create or replace function public.registration_proof_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ok boolean;
  used integer := 0;
begin
  select exists (
    select 1
    from public.registration_orders o
    join public.registration_events e on e.id = o.event_id
    where o.code = split_part(p_name, '/', 1)
      and p_name ~ '^[A-Z0-9]{12}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$'
      and o.status = 'confirmed'
      and o.payment_status in ('awaiting', 'reported')
      and e.status <> 'draft'
  ) into ok;
  if not ok then
    return false;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects where bucket_id = $1 and name like $2'
      into used
      using 'registration-proofs', split_part(p_name, '/', 1) || '/%';
  end if;
  return used < 5;
end;
$$;
revoke all on function public.registration_proof_allowed(text) from public;
grant execute on function public.registration_proof_allowed(text) to anon, authenticated;
select public.migration_done(331, '0331_a_rule_the_app_follows_the_database_holds_too', '258b7464a7b95158bab2b63fe93e39da4264c315bc0252de87986c7c08062633');

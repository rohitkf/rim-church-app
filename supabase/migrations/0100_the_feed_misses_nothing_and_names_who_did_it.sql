/*
 * The feed misses nothing, and says who did it.
 *
 * "Live activity" was written to answer one question — what is happening to
 * this service — and it answered most of it. But somebody could mark
 * themselves available and then take the answer away again, and the feed
 * said only the first half: the trigger fired on insert and update and not
 * on delete, so a row vanishing vanished silently. A feed with a hole in it
 * is worse than no feed, because people stop checking the parts that work.
 *
 * Two things wrong, then. This fixes both.
 *
 * **Deletions are events.** Taking an answer back, dropping a call time,
 * removing a set of minutes — each is a change to the service somebody
 * else is planning around. Every trigger here now fires on delete as well.
 *
 * **The actor is whoever did it, not whoever it was about.** Availability
 * was recorded against the row's owner, so an Admin correcting somebody's
 * answer over the phone appeared in the feed as that person changing their
 * own mind. Now the actor is the signed-in account and the person is named
 * in the line when the two differ — which is the whole point of a feed that
 * is supposed to make changes visible to everybody.
 *
 * And the things nothing watched at all: the service itself (added, moved,
 * renamed, ended), call times, late availability requests, and debrief
 * minutes.
 */

-- ---------------------------------------------------------------------------
-- Availability: every direction, attributed to whoever did it
-- ---------------------------------------------------------------------------

/**
 * A person's name, for the lines that have to say whose answer it was.
 */
create or replace function public.person_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  from public.profiles where id = uid;
$$;

create or replace function public.activity_from_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  team text;
  actor uuid := coalesce(auth.uid(), row_now.user_id);
  -- Whose answer this is, said only when somebody else is changing it:
  -- "can serve — Media" for yourself, "marked available for Grace Mensah"
  -- when the head does it on the phone.
  owner_suffix text := case
    when actor is distinct from row_now.user_id
      then ' for ' || coalesce(public.person_name(row_now.user_id), 'somebody')
    else ''
  end;
begin
  select name into team from public.departments where id = row_now.department_id;

  if tg_op = 'DELETE' then
    -- The event that used to disappear without trace.
    perform public.record_activity(
      old.service_id, old.department_id, actor, 'availability', team,
      'removed' || owner_suffix
    );
    return old;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'availability', team,
      new.status::text || owner_suffix
    );
  end if;

  if tg_op = 'UPDATE' and new.attended is distinct from old.attended then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'attendance', team,
      case
        when new.attended is null then 'attendance cleared' || owner_suffix
        when new.attended then 'turned up' || owner_suffix
        else 'did not turn up' || owner_suffix
      end
    );
  elsif tg_op = 'INSERT' and new.attended is not null then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'attendance', team,
      case when new.attended then 'turned up' else 'did not turn up' end || owner_suffix
    );
  end if;

  return new;
end;
$$;

drop trigger if exists activity_availability on public.availability;
create trigger activity_availability
  after insert or update or delete on public.availability
  for each row execute function public.activity_from_availability();

-- ---------------------------------------------------------------------------
-- The service itself
-- ---------------------------------------------------------------------------

/**
 * A service being added, moved, renamed or called to an end.
 *
 * The largest changes anybody can make to a Sunday were the ones the feed
 * said nothing about: a date moving takes every rota, checklist and answer
 * with it.
 */
create or replace function public.activity_from_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_activity(
      new.id, null, auth.uid(), 'service', new.service_type, 'added'
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Nothing to file it against: the service is the thing that is gone,
    -- and `record_activity` drops rows with no service anyway.
    return old;
  end if;

  if new.date is distinct from old.date then
    perform public.record_activity(
      new.id, null, auth.uid(), 'service', new.service_type,
      'moved to ' || to_char(new.date, 'FMDay FMDD Mon')
    );
  end if;

  if new.service_type is distinct from old.service_type then
    perform public.record_activity(
      new.id, null, auth.uid(), 'service', new.service_type,
      'renamed from ' || old.service_type
    );
  end if;

  if new.ended_at is distinct from old.ended_at then
    perform public.record_activity(
      new.id, null, auth.uid(), 'service', new.service_type,
      case when new.ended_at is null then 'reopened' else 'called the end' end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists activity_service on public.services;
create trigger activity_service
  after insert or update or delete on public.services
  for each row execute function public.activity_from_service();

-- ---------------------------------------------------------------------------
-- Call times
-- ---------------------------------------------------------------------------

/**
 * When a team is told to be in, which is the thing they plan their morning
 * around.
 *
 * A call time belongs to a day rather than to a service — one team is in at
 * eight whether that morning holds one service or two — so it is filed
 * against every service on that date. Whichever one somebody is looking at,
 * the change to their morning is on it.
 */
create or replace function public.activity_from_call_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  team text;
  clock text;
  said text;
  svc record;
begin
  if tg_op = 'UPDATE' and new.call_time is not distinct from old.call_time then
    return new;
  end if;

  select name into team from public.departments where id = row_now.department_id;
  clock := to_char(row_now.call_time, 'HH24:MI');
  said := case tg_op
    when 'INSERT' then 'called in at ' || clock
    when 'UPDATE' then 'call time moved to ' || clock
    else 'call time removed'
  end;

  for svc in select id from public.services where date = row_now.on_date loop
    perform public.record_activity(
      svc.id, row_now.department_id, coalesce(auth.uid(), row_now.updated_by),
      'call_time', team, said
    );
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_call_time on public.department_call_times;
create trigger activity_call_time
  after insert or update or delete on public.department_call_times
  for each row execute function public.activity_from_call_time();

-- ---------------------------------------------------------------------------
-- Late availability requests (0095)
-- ---------------------------------------------------------------------------

/**
 * Asking after the deadline, and the answer.
 *
 * The approval already writes an availability row, which the trigger above
 * records — but "asked and was refused" leaves no trace of itself, and a
 * head deciding is exactly the kind of change the feed exists for.
 */
create or replace function public.activity_from_availability_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team text;
  who text := coalesce(public.person_name(new.user_id), 'somebody');
begin
  select name into team from public.departments where id = new.department_id;

  if tg_op = 'INSERT' then
    perform public.record_activity(
      new.service_id, new.department_id, new.user_id, 'availability_request', team,
      'asked to be marked ' || new.requested_status::text || ' after the deadline'
    );
    return new;
  end if;

  if new.status is distinct from old.status and new.status <> 'pending' then
    perform public.record_activity(
      new.service_id, new.department_id, coalesce(new.decided_by, auth.uid()),
      'availability_request', team,
      case when new.status = 'approved' then 'approved ' else 'turned down ' end
        || who || '''s late change'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists activity_availability_request on public.availability_change_requests;
create trigger activity_availability_request
  after insert or update on public.availability_change_requests
  for each row execute function public.activity_from_availability_request();

-- ---------------------------------------------------------------------------
-- Debrief minutes (0099)
-- ---------------------------------------------------------------------------

create or replace function public.activity_from_debrief()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  team text;
begin
  select name into team from public.departments where id = row_now.department_id;

  perform public.record_activity(
    row_now.service_id, row_now.department_id, coalesce(auth.uid(), row_now.written_by),
    'debrief', team,
    case tg_op
      when 'INSERT' then 'wrote up the debrief'
      when 'UPDATE' then 'updated the debrief'
      else 'removed the debrief'
    end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_debrief on public.service_debriefs;
create trigger activity_debrief
  after insert or update or delete on public.service_debriefs
  for each row execute function public.activity_from_debrief();

-- ---------------------------------------------------------------------------
-- The songs (0074)
-- ---------------------------------------------------------------------------

create or replace function public.activity_from_set_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
begin
  -- A song being renamed mid-edit is noise; added, dropped and re-ordered
  -- are what the rest of the church notices.
  if tg_op = 'UPDATE' and new.title is not distinct from old.title
     and new.led_by is not distinct from old.led_by then
    return new;
  end if;

  perform public.record_activity(
    row_now.service_id, null, coalesce(auth.uid(), row_now.created_by),
    'set_list', row_now.title,
    case tg_op
      when 'INSERT' then 'added to the set list'
      when 'UPDATE' then 'changed on the set list'
      else 'taken off the set list'
    end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_set_list on public.set_list_items;
create trigger activity_set_list
  after insert or update or delete on public.set_list_items
  for each row execute function public.activity_from_set_list();

-- ---------------------------------------------------------------------------
-- Who is on a running-order session (0093)
-- ---------------------------------------------------------------------------

/**
 * 0093 logged a bare "changed" for a name going on or off a session, which
 * is true and says nothing. The name is the news.
 */
create or replace function public.activity_from_session_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  sess record;
  who text;
begin
  select service_id, department_id, session_name
    into sess
    from public.service_sessions
   where id = row_now.session_id;

  if not found then return coalesce(new, old); end if;

  who := coalesce(
    public.person_name(row_now.user_id),
    (select btrim(coalesce(g.title || ' ', '') || g.name) from public.guests g where g.id = row_now.guest_id),
    'somebody'
  );

  perform public.record_activity(
    sess.service_id, sess.department_id, auth.uid(), 'planner', sess.session_name,
    case when tg_op = 'INSERT' then who || ' put on' else who || ' taken off' end
  );
  return coalesce(new, old);
end;
$$;

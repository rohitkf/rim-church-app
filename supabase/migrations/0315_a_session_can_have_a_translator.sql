/*
 * A session can have a translator.
 *
 * A message preached in one language is often said again, line by line,
 * in another, and whoever does that is neither taking the session nor
 * standing by to take it. The running order had nowhere to put them:
 * named with the people taking it, they read as a second preacher; named
 * as a substitute (0182), as somebody who is not expected to speak at all.
 *
 * So a translator is one more row on `service_session_assignees`, marked
 * `is_translator`, the way a substitute is marked `is_substitute`. The
 * column defaults to false, so every row already there is what it was and
 * nothing changes until a planner names one. The rows keep their own
 * `order_index` within each of the three lists.
 *
 * Nobody is two things on one session. The indexes that keep a person on
 * a session once (0093) hold across all three lists, and a row cannot be
 * both marks at once.
 *
 * Who may write them is the session's own rule (`svc.sessions`, 0134),
 * until the service is over — the `_write_` policies (0200), which ask
 * nothing about the marks. The planner button somebody can be given for
 * substitutes (0184) stays what it was: its policies want `is_substitute`,
 * and the new check will not let such a row be a translator as well, so
 * holding that button names no translator.
 *
 * The activity feed says "put on" and "taken off" of anybody; of a
 * translator it now says so, because "Ps Saju put on Message" beside the
 * preacher's own line reads as two people preaching.
 */

alter table public.service_session_assignees
  add column if not exists is_translator boolean not null default false;

comment on column public.service_session_assignees.is_translator is
  'True for somebody translating the session as it is taken. Shown apart from the people taking it, and from a substitute, on the planner and the sheet.';

alter table public.service_session_assignees
  drop constraint if exists service_session_assignees_one_part;
alter table public.service_session_assignees
  add constraint service_session_assignees_one_part check (not (is_substitute and is_translator));

create or replace function public.activity_from_session_assignee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  row_now record := coalesce(new, old);
  sess record;
  who text;
begin
  -- A guest's rows moving onto their account (0293): the same person,
  -- still on the session.
  if current_setting('rim.same_person_moving', true) = 'on' then
    return coalesce(new, old);
  end if;

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
    who
      || case when tg_op = 'INSERT' then ' put on' else ' taken off' end
      -- A translator (0315) is said to be one: beside the preacher's own
      -- line, "put on" alone reads as a second person taking it.
      || case when row_now.is_translator then ' as translator' else '' end
  );
  return coalesce(new, old);
end;
$function$;
select public.migration_done(315, '0315_a_session_can_have_a_translator', '91867bff2ed45c2342f57e9877e77292f13f2a48d1b924c393c6a8e7fc4460bf');

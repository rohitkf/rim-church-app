/*
 * 0293 — A guest who joins keeps their sessions, once
 *
 * Linking a name on the guest roll to an account (`guests.became_member`)
 * moves that person's team places, their availability and their rota roles
 * onto the account (0161, 0166, 0167). It did not move the sessions they
 * were taking: `service_session_assignees` kept them as the guest. So the
 * running order still named the guest, the member could be put on the same
 * session beside themselves, and the planner and its exported sheet said
 * "Ps Godlee Cherian" twice on Message 2 (15 November 2026).
 *
 * Now the sessions move too. Each row of the guest's becomes the
 * account's, in the same place in the order and the same list (taking it,
 * or substitute). Where the account is already on that session, the
 * guest's row goes instead: a person is on a session once (the table's own
 * rule, `service_session_assignees_member_once`), and the row somebody
 * chose for the account is the one that stays.
 *
 * Finished services are moved as well, unlike availability and the rota:
 * nothing is being changed about who took the session, only which of
 * their two records says so.
 *
 * The activity feed is not told. A row turned from guest to account logs
 * nothing anyway (the feed hears inserts and deletes); the one removed as
 * a duplicate would have said "Ps Godlee Cherian taken off" about somebody
 * still on the session, so the move says, for the length of its own
 * transaction, that it is not news.
 */

-- ---------------------------------------------------------------------------
-- The feed, with a way to be told a change is not news
-- ---------------------------------------------------------------------------

-- 0100's function, and one line more: the check at the top.
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
    case when tg_op = 'INSERT' then who || ' put on' else who || ' taken off' end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- A guest's sessions, onto the account
-- ---------------------------------------------------------------------------

/* Answers how many session rows now belong to the account or went as duplicates. */
create or replace function public.guest_sessions_move_to_account(p_guest uuid, p_member uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  was text := current_setting('rim.same_person_moving', true);
  gone integer;
  moved integer;
begin
  if p_guest is null or p_member is null then return 0; end if;
  perform set_config('rim.same_person_moving', 'on', true);

  -- Already on the session as themselves: the guest's row is the spare.
  delete from public.service_session_assignees a
   where a.guest_id = p_guest
     and exists (
       select 1 from public.service_session_assignees m
        where m.session_id = a.session_id and m.user_id = p_member
     );
  get diagnostics gone = row_count;

  update public.service_session_assignees
     set user_id = p_member, guest_id = null
   where guest_id = p_guest;
  get diagnostics moved = row_count;

  perform set_config('rim.same_person_moving', coalesce(was, ''), true);
  return gone + moved;
end;
$$;

comment on function public.guest_sessions_move_to_account(uuid, uuid) is
  'Move the sessions a guest was taking onto the account they were linked to; where the account is already on a session, the guest''s row goes (0293).';

revoke all on function public.guest_sessions_move_to_account(uuid, uuid) from public, anon, authenticated;

-- 0167's function, and one line more: the sessions.
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

-- ---------------------------------------------------------------------------
-- Everybody linked before today
-- ---------------------------------------------------------------------------

do $$
declare
  g record;
begin
  for g in select id, became_member from public.guests where became_member is not null loop
    perform public.guest_sessions_move_to_account(g.id, g.became_member);
  end loop;
end $$;
select public.migration_done(293, '0293_a_guest_who_joins_keeps_their_sessions_once', '235a8797ecf9df4aca0f5c2ac2bd6496ade42150351f6ae5f42e3e03b3085010');

-- ============================================================================
-- Telling the team a poll has been posted
-- ============================================================================
--
-- A poll is a question put to a team, and a question nobody is told about
-- is a question nobody answers. Until now it appeared on the team's board
-- and waited to be noticed, which meant whoever opened the page that
-- evening voted and everyone else found it closed.
--
-- Same shape as a team alert: an AFTER INSERT trigger running as the
-- definer, because writing a notification row for somebody else is a thing
-- no ordinary role may do directly.
--
-- Who hears about it is exactly who may read the poll: the team, plus
-- whoever leads it. A head is not always in `department_members` — leading
-- a team and being rostered on it are different facts — so both are asked
-- for. `notify_people` drops the person who posted it and de-duplicates
-- against anything unread of the same kind from the last six hours.
--
-- The notification carries the department, not the poll, as its reference:
-- the bell's link opens that team's room, and a poll has no page of its
-- own to open.

create or replace function public.notify_on_team_poll()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_people(
    array(
      select user_id from public.department_members
      where department_id = new.department_id
      union
      select user_id from public.user_roles
      where department_id = new.department_id
        and role_type in ('department_head', 'assisting_head')
    ),
    'team_poll',
    new.department_id,
    new.question
  );
  return new;
end;
$$;

drop trigger if exists notify_on_team_poll on public.team_polls;
create trigger notify_on_team_poll
  after insert on public.team_polls
  for each row execute function public.notify_on_team_poll();

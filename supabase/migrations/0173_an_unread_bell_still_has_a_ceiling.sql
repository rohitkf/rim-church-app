-- Two things the audit's final reviewer asked of 0170 and 0172.
--
-- 0170 made the bell trim keep every unread row, so that a dozen board
-- posts could no longer erase a prompt nobody had read. Taken literally
-- that left no ceiling at all: somebody who can produce rows faster than
-- another person reads them (a mention a minute, a join ask per team per
-- day) could grow that person's bell without end. Unread rows still
-- outlast read ones, but there is a ceiling — five times the kept count,
-- never under fifty — and beyond it the oldest unread go first.
--
-- 0172 let a poll be anonymous or named, and left `anonymous` a column
-- the asker could still change, since team_polls_change (0114) lets them
-- edit their own poll. Flipping an anonymous poll to named after people
-- had answered would show every name they were promised stayed hidden.
-- Once anybody has answered, the question of names is settled.

create or replace function public.keep_newest_notifications(p_users uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep integer := coalesce((select notification_keep_count from public.app_settings limit 1), 10);
  ceiling integer := greatest(keep * 5, 50);
begin
  -- Read rows past the newest N go; unread ones stay — up to the ceiling.
  delete from public.notifications n
  using (
    select id from (
      select id, read_boolean,
             row_number() over (partition by user_id order by created_at desc, id desc) as place,
             row_number() over (partition by user_id, read_boolean order by created_at desc, id desc) as place_among_alike
      from public.notifications
      where p_users is null or user_id = any (p_users)
    ) ranked
    where (place > keep and read_boolean)
       or (not read_boolean and place_among_alike > ceiling)
  ) extra
  where n.id = extra.id;

  -- The board notice is the one kind that arrives by the dozen: one each.
  delete from public.notifications n
  using (
    select id from (
      select id, row_number() over (partition by user_id order by created_at desc, id desc) as place
      from public.notifications
      where type = 'message' and (p_users is null or user_id = any (p_users))
    ) ranked
    where place > 1
  ) extra
  where n.id = extra.id;
end;
$$;

create or replace function public.poll_anonymity_is_settled_by_the_first_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.anonymous is distinct from old.anonymous
     and exists (select 1 from public.team_poll_votes v where v.poll_id = old.id) then
    raise exception 'Whether a poll is anonymous cannot change once somebody has answered it.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.poll_anonymity_is_settled_by_the_first_answer() from public, anon, authenticated;

drop trigger if exists team_polls_anonymity_is_settled on public.team_polls;
create trigger team_polls_anonymity_is_settled
  before update of anonymous on public.team_polls
  for each row execute function public.poll_anonymity_is_settled_by_the_first_answer();

notify pgrst, 'reload schema';

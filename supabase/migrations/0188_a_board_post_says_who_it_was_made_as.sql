/*
 * A board post says who it was made as.
 *
 * A post on the message board wears its team's badge. A post with no team
 * was, until 0187, always an Admin's, so the board drew every one of them
 * with an "Admin" badge. Overwatch posts with no team too — it speaks as
 * itself, never for a team — and its posts were being badged Admin.
 *
 * The board cannot work it out when it draws a post: who holds Admin is
 * not something every reader may read (user_roles_select_own). So the post
 * carries it, written once, when it is made, by the database rather than
 * by whoever is posting — nobody can claim a badge they do not hold, and a
 * post keeps the badge it was made under after the role moves on, the way
 * a team badge stays on a post when somebody leaves the team.
 *
 * A post with no team by somebody who is neither (a church that has opened
 * whole-church posting in the grid) carries nothing, and is drawn with no
 * badge rather than a wrong one.
 */

alter table public.messages
  add column if not exists posted_as text
    constraint messages_posted_as_is_known check (posted_as in ('admin', 'overwatch'));

comment on column public.messages.posted_as is
  'What a post with no team was made as: admin or overwatch. Set by messages_set_posted_as; null for a team''s post.';

create or replace function public.messages_set_posted_as()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Written once: a change to a post never re-badges it.
  if tg_op = 'UPDATE' then
    new.posted_as := old.posted_as;
    return new;
  end if;
  new.posted_as := case
    when new.department_id is not null then null
    when public.is_admin(new.author_id)
      or exists (select 1 from public.app_owner o where o.user_id = new.author_id) then 'admin'
    when public.is_overwatch(new.author_id) then 'overwatch'
    else null
  end;
  return new;
end;
$$;

revoke all on function public.messages_set_posted_as() from public, anon, authenticated;

-- The posts already on the board, by what their authors hold now: the
-- nearest there is to what they held when they wrote them, and the board
-- clears every week.
update public.messages m
set posted_as = case
  when public.is_admin(m.author_id)
    or exists (select 1 from public.app_owner o where o.user_id = m.author_id) then 'admin'
  when public.is_overwatch(m.author_id) then 'overwatch'
  else null
end
where m.department_id is null;

drop trigger if exists messages_set_posted_as on public.messages;
create trigger messages_set_posted_as
  before insert or update on public.messages
  for each row execute function public.messages_set_posted_as();

notify pgrst, 'reload schema';

-- ============================================================================
-- Message board moderation: delete one post, or clear the board
-- ============================================================================
-- The weekly pg_cron reset already deletes the 'message' notifications
-- alongside the posts, so the bell never points at a row that no longer
-- exists. A post deleted by hand needs the same treatment, and RLS alone
-- can't do it: notifications carry no delete policy (they are fanned out to
-- everyone, so no ordinary user may touch another person's row). Both
-- deletions therefore run in one security-definer function that does its
-- own permission check.
--
-- Deletes are qualified with `where ctid is not null` — always true, and
-- unlike `where true` it survives constant folding into the plan, where
-- pg_safeupdate (loaded on Supabase's API roles) insists on seeing a
-- WHERE clause.

-- Author or Admin, matching the messages_delete policy.
create or replace function public.delete_message(message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  select author_id into author from public.messages where id = message_id;
  if author is null then
    raise exception 'That message no longer exists';
  end if;

  if not (author = auth.uid() or public.is_admin(auth.uid())) then
    raise exception 'You can only delete your own posts';
  end if;

  delete from public.notifications where type = 'message' and reference_id = message_id;
  delete from public.messages where id = message_id;
end;
$$;

-- Admin only: the board is shared, so emptying it is not something a single
-- poster gets to do to everyone else's announcements.
create or replace function public.clear_message_board()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can clear the message board';
  end if;

  delete from public.notifications where type = 'message';
  delete from public.messages where ctid is not null;
end;
$$;

revoke all on function public.delete_message(uuid) from public;
revoke all on function public.clear_message_board() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.delete_message(uuid) to authenticated;
    grant execute on function public.clear_message_board() to authenticated;
  end if;
end $$;

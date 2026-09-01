-- ============================================================================
-- A deleted message is allowed to be empty
-- ============================================================================
-- 0062 made a delete soft: the row stays so the conversation keeps its shape,
-- and the body is blanked so the words are really gone. The body's own check
-- constraint had other ideas — it was written when the only way a message
-- lost its text was a mistake, and it refused the empty string outright. So
-- every delete failed on `team_messages_body_check`.
--
-- The rule was right for a message somebody can read and wrong for one nobody
-- can. It now says so: still no blank messages, unless the message is deleted,
-- and still nothing over 2000 characters either way.
alter table public.team_messages drop constraint if exists team_messages_body_check;

alter table public.team_messages
  add constraint team_messages_body_check
  check (
    length(body) <= 2000
    and (deleted_at is not null or length(btrim(body)) > 0)
  );

-- ----------------------------------------------------------------------------
-- And a deleted message really cannot be edited
-- ----------------------------------------------------------------------------
-- 0062 meant to refuse that and asked the questions in the wrong order. An
-- update to an already-deleted row still carries its `deleted_at`, so it took
-- the delete branch — blanked an already-blank body and returned happily —
-- and the guard underneath was never reached. Nothing was rewritten, because
-- the delete branch throws the body away; but a refusal that reports success
-- is not a refusal.
--
-- The old row is asked about first now: once a message is gone, nothing more
-- happens to it.
create or replace function public.guard_team_message_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- An edit is an edit: whose message it is, which room it is in and when it
  -- was said are not the author's to change, and a policy cannot see the old
  -- row to say so.
  new.id := old.id;
  new.author_id := old.author_id;
  new.department_id := old.department_id;
  new.created_at := old.created_at;
  new.kind := old.kind;

  -- Gone is gone.
  if old.deleted_at is not null then
    raise exception 'a deleted message cannot be changed';
  end if;

  -- Taking a message down is not editing it: the body goes with it.
  if new.deleted_at is not null then
    new.body := '';
    new.mentions := '{}';
    return new;
  end if;

  -- Only somebody's own words can be rewritten, and only by them.
  if new.body is distinct from old.body then
    if auth.uid() <> old.author_id then
      raise exception 'only the author can edit a message';
    end if;
    if length(btrim(new.body)) = 0 then
      raise exception 'an edited message still needs something in it';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

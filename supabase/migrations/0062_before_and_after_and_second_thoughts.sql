-- ============================================================================
-- A checklist has two halves, and a message can be wrong
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Pre- and post-service checklists
-- ----------------------------------------------------------------------------
-- A role's checklist was one list, which put "recording is turned on" next to
-- "batteries on charge for next week". They are different jobs done at
-- different ends of a service, and reading one list at both ends means
-- ticking things that cannot be true yet.
--
-- Everything that exists is 'pre': that is what the lists were written for,
-- and a checklist that silently moved half its items to the other end of the
-- service would be worse than one that never split.
alter table public.department_role_checklist_items
  add column if not exists phase text not null default 'pre'
    check (phase in ('pre', 'post'));

-- The reorder is per phase now, so a drag inside "before" cannot renumber
-- "after" out from under it.
create or replace function public.reorder_role_checklist_items(role uuid, ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  i int;
  the_phase text;
begin
  if coalesce(array_length(ids, 1), 0) = 0 then
    return;
  end if;

  select phase into the_phase
  from public.department_role_checklist_items where id = ids[1];

  if coalesce(array_length(ids, 1), 0) <> (
    select count(*) from public.department_role_checklist_items
    where role_id = role and phase = the_phase
  ) then
    raise exception 'a reorder needs every item of that half of the checklist, once each';
  end if;

  for i in 1..array_length(ids, 1) loop
    update public.department_role_checklist_items
       set sort_order = i
     where id = ids[i] and role_id = role and phase = the_phase;
    if not found then
      raise exception 'cannot reorder this checklist';
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Editing and deleting a team message
-- ----------------------------------------------------------------------------
-- Deleting was already allowed and took the message with it, which reads to
-- everyone else as though it was never sent — mid-conversation that is its own
-- confusion. A delete now leaves the row and blanks the body, so the gap in
-- the conversation is visible and says what happened.
alter table public.team_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- The author edits their own; an Admin can take one down but never rewrite it,
-- which the trigger below enforces rather than trusting the client.
drop policy if exists team_messages_update on public.team_messages;
create policy team_messages_update on public.team_messages
  for update
  using (author_id = auth.uid() or public.is_admin(auth.uid()))
  with check (author_id = auth.uid() or public.is_admin(auth.uid()));

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

  -- Taking a message down is not editing it: the body goes, and it cannot
  -- come back.
  if new.deleted_at is not null then
    new.body := '';
    new.mentions := '{}';
    new.deleted_at := coalesce(old.deleted_at, now());
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'a deleted message cannot be edited';
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

drop trigger if exists team_messages_guard_edit on public.team_messages;
create trigger team_messages_guard_edit before update on public.team_messages
  for each row execute function public.guard_team_message_edit();

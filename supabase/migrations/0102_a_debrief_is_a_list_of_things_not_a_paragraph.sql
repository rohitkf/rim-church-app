/*
 * A debrief is a list of things, not a paragraph.
 *
 * 0099 gave each team one box to type into, and a box is what you use when
 * you already know what you want to say. A debrief is not like that. It is
 * six people remembering the morning out of order — the mic, the lyrics
 * being a verse behind, nobody having a key for the back door — and each
 * one of those is a separate thing that a separate person has to deal with
 * before next Sunday.
 *
 * Typed as prose, that list has two problems. Adding the seventh thing
 * means re-opening and re-saving the whole paragraph, so the people who
 * remember something on Monday don't bother. And a paragraph cannot be
 * finished: "somebody order batteries" sits in the middle of a block of
 * text with nothing to mark it done, so next Sunday nobody knows whether
 * it happened.
 *
 * So: items. Each one a line, optionally on somebody, and tickable. The
 * team's debrief row stays exactly what it was — the thing that holds them,
 * that carries who wrote up first, and that the retention window deletes —
 * and the items hang off it and go when it goes.
 */

-- The prose box the items replace. Kept nullable rather than dropped: the
-- build in front of people writes to it until the deploy carrying this
-- lands, and a column nobody fills costs nothing next to a save that fails
-- for the head trying to use it in between.
alter table public.service_debriefs alter column minutes drop not null;

comment on column public.service_debriefs.minutes is
  'Superseded by service_debrief_items. Left nullable so the previous build''s writes do not fail mid-deploy; nothing writes it now.';

create table if not exists public.service_debrief_items (
  id uuid primary key default gen_random_uuid(),
  debrief_id uuid not null references public.service_debriefs(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 1000),
  /**
   * Who has to do something about it, when it is that kind of item.
   *
   * Null for the ones that are only worth remembering — "the new projector
   * was much better" needs nobody's name on it.
   */
  assigned_to uuid references public.profiles(id) on delete set null,
  /** When it was ticked, and by whom. Null is the whole of "not done yet". */
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  -- The order they were said in, which is the order the team will read
  -- them back in.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.service_debrief_items is
  'One thing said in a team''s debrief: a line, optionally on somebody, and tickable once it is dealt with. Deleted with its debrief when the retention window passes.';

alter table public.service_debrief_items enable row level security;

create trigger service_debrief_items_touch_updated_at
  before update on public.service_debrief_items
  for each row execute function public.touch_updated_at();

create index if not exists service_debrief_items_by_debrief
  on public.service_debrief_items (debrief_id, sort_order);

-- Read by anybody signed in, for the same reason the minutes are: a
-- problem one team solved is a problem another team need not.
create policy service_debrief_items_select on public.service_debrief_items
  for select using (auth.uid() is not null);

/*
 * Written by whoever runs the team, or an Admin — the same hands that
 * could write the minutes, since this is the same debrief.
 *
 * The test goes through the parent row: an item's team is its debrief's
 * team, and saying so twice is how the two drift apart.
 */
create or replace function public.may_write_debrief(debrief uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_debriefs d
    where d.id = debrief
      and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), d.department_id))
  );
$$;

create policy service_debrief_items_insert on public.service_debrief_items
  for insert with check (public.may_write_debrief(debrief_id));

create policy service_debrief_items_update on public.service_debrief_items
  for update using (public.may_write_debrief(debrief_id))
  with check (public.may_write_debrief(debrief_id));

create policy service_debrief_items_delete on public.service_debrief_items
  for delete using (public.may_write_debrief(debrief_id));

/**
 * Each item in the live activity feed.
 *
 * 0100 went through everything that happens to a service and gave it a
 * line; this is the same rule applied to the thing that replaced the
 * minutes. Ticking one off is the news the rest of the week waits on.
 */
create or replace function public.activity_from_debrief_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  parent record;
  team text;
  said text;
begin
  select service_id, department_id into parent
    from public.service_debriefs where id = row_now.debrief_id;
  -- The debrief itself is going, taking its items with it: that is one
  -- event, and 0100's trigger on the parent already says so.
  if not found then return coalesce(new, old); end if;

  select name into team from public.departments where id = parent.department_id;

  if tg_op = 'UPDATE' then
    if new.done_at is distinct from old.done_at then
      said := case when new.done_at is null then 'put a debrief item back' else 'ticked a debrief item off' end;
    elsif new.body is distinct from old.body or new.assigned_to is distinct from old.assigned_to then
      said := 'reworded a debrief item';
    else
      -- A re-order is not news, the same way the set list's isn't.
      return new;
    end if;
  else
    said := case when tg_op = 'INSERT' then 'added a debrief item' else 'removed a debrief item' end;
  end if;

  perform public.record_activity(
    parent.service_id, parent.department_id,
    coalesce(auth.uid(), row_now.created_by), 'debrief', team, said
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_debrief_item on public.service_debrief_items;
create trigger activity_debrief_item
  after insert or update or delete on public.service_debrief_items
  for each row execute function public.activity_from_debrief_item();

-- A debrief is several people round a table with their phones out: one
-- types, the others watch the list grow.
do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_debrief_items'
  ) then
    alter publication supabase_realtime add table public.service_debrief_items;
  end if;
end $pub$;

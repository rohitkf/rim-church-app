/*
 * The rota has tags, and the church chooses them.
 *
 * 0106 gave an assignment one fixed flag, "Shadow", for somebody learning
 * a role. It was the first of several: "First time", "Leading", "Cover" —
 * each church has its own, and a boolean column per word is a migration
 * per word. So the words become rows an Admin keeps, each with a colour,
 * and an assignment carries as many of them as apply.
 *
 *   rota_tags             the church's list: name, colour, order, and
 *                         whether it is shown on the rota at all;
 *   rota_assignment_tags  which tags an assignment carries.
 *
 * Shadow is the first row, and every assignment marked as a shadow keeps
 * the mark. `rota_assignments.is_shadow` stays for now so the app that is
 * live while this is applied keeps drawing; nothing writes it any more,
 * and a later migration drops it.
 *
 * Tags are labels, not rules. A shadow is still that person's one role at
 * the service (0084), whatever it is tagged — the rule counts
 * assignments, and a tag never exempts one.
 *
 * Also here: the colour of the Team Coordinator's row, an Admin's choice
 * in the same place. Null is the night sky it has now.
 */

create table if not exists public.rota_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 24),
  -- One of the palette's hexes in practice; any six-digit hex is accepted
  -- so the palette can grow without a migration.
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null default 0,
  -- Off: kept, with every assignment that carries it, but neither offered
  -- when assigning nor drawn on the rota.
  shown boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists rota_tags_name_key on public.rota_tags (lower(btrim(name)));

alter table public.rota_tags enable row level security;

drop policy if exists rota_tags_select on public.rota_tags;
create policy rota_tags_select on public.rota_tags
  for select using (auth.uid() is not null);

drop policy if exists rota_tags_write on public.rota_tags;
create policy rota_tags_write on public.rota_tags
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table if not exists public.rota_assignment_tags (
  assignment_id uuid not null references public.rota_assignments(id) on delete cascade,
  tag_id uuid not null references public.rota_tags(id) on delete cascade,
  primary key (assignment_id, tag_id)
);

create index if not exists rota_assignment_tags_tag_idx on public.rota_assignment_tags (tag_id);

alter table public.rota_assignment_tags enable row level security;

-- Seen by whoever can see the assignment: the subquery runs under the
-- caller's own policies on rota_assignments.
drop policy if exists rota_assignment_tags_select on public.rota_assignment_tags;
create policy rota_assignment_tags_select on public.rota_assignment_tags
  for select using (
    exists (select 1 from public.rota_assignments a where a.id = assignment_id)
  );

-- Written by whoever may write the assignment, on the same terms.
drop policy if exists rota_assignment_tags_write on public.rota_assignment_tags;
create policy rota_assignment_tags_write on public.rota_assignment_tags
  for all
  using (
    exists (
      select 1 from public.rota_assignments a
      where a.id = assignment_id
        and not public.service_has_finished(a.service_id)
        and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), a.department_id))
    )
  )
  with check (
    exists (
      select 1 from public.rota_assignments a
      where a.id = assignment_id
        and not public.service_has_finished(a.service_id)
        and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), a.department_id))
    )
  );

-- Shadow, carried over.
insert into public.rota_tags (name, color, sort_order)
values ('Shadow', '#34D399', 0)
on conflict do nothing;

insert into public.rota_assignment_tags (assignment_id, tag_id)
select a.id, t.id
from public.rota_assignments a
join public.rota_tags t on lower(btrim(t.name)) = 'shadow'
where a.is_shadow
on conflict do nothing;

comment on column public.rota_assignments.is_shadow is
  'Superseded by rota_assignment_tags (0107). Not written; to be dropped.';

/*
 * Assign somebody, with their tags, in one step.
 *
 * Security invoker: every insert below is the caller's own, under the
 * policies above, so this adds no power — it only means a role is never
 * left assigned with half its tags because the second request failed.
 */
create or replace function public.assign_to_rota(
  service uuid,
  department uuid,
  person uuid,
  role_label text,
  role uuid default null,
  tags uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  made uuid;
begin
  insert into public.rota_assignments (service_id, department_id, user_id, role_label, role_id)
  values (service, department, person, role_label, role)
  returning id into made;

  insert into public.rota_assignment_tags (assignment_id, tag_id)
  select made, t from unnest(coalesce(tags, '{}')) as t
  on conflict do nothing;

  return made;
end;
$$;

revoke all on function public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[]) to authenticated;

-- The activity line goes back to saying who was assigned: the tags arrive
-- a statement later than this trigger fires, so it cannot name them, and
-- is_shadow is no longer written for it to read.
create or replace function public.activity_from_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  who text;
begin
  if tg_op = 'DELETE' then
    select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
      into who from public.profiles where id = old.user_id;
    perform public.record_activity(
      old.service_id, old.department_id, auth.uid(), 'rota',
      old.role_label, coalesce(nullif(who, ''), 'someone') || ' taken off'
    );
    return old;
  end if;

  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into who from public.profiles where id = new.user_id;
  perform public.record_activity(
    new.service_id, new.department_id, auth.uid(), 'rota',
    new.role_label, coalesce(nullif(who, ''), 'someone') || ' assigned'
  );
  return new;
end;
$function$;

-- The Coordinator's row: null is the night sky; a hex tints it.
alter table public.app_settings
  add column if not exists coordinator_color text
  check (coordinator_color is null or coordinator_color ~ '^#[0-9A-Fa-f]{6}$');

-- Live: a tag added in Settings, or put on somebody, shows on every open
-- rota. service_series rides along — 0105 listed it for live updates and
-- never joined it to the publication, so a stopped repeat only showed on
-- the next reload.
do $pub$
declare
  t text;
begin
  foreach t in array array['rota_tags', 'rota_assignment_tags', 'service_series'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $pub$;

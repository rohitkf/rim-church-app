/*
 * A layout for each area, and a word about each release.
 *
 * Two things, in one migration because the first is not whole without
 * the second's announcement.
 *
 * ## Areas
 *
 * A stage is not the only thing that gets laid out: where the welcome
 * desk goes, which rows are kept for the prayer team, where the camera
 * stands in the hall. So the church keeps a list of areas — Stage and
 * Audience to begin with, in Settings › Stage layout — and a session can
 * carry a layout for any of them. Each area has its own size and its own
 * two edge labels, so the top of the Audience reads "Stage" and the top
 * of the Stage reads "Back of stage". Templates belong to an area: a
 * stage template applied to the hall would be nonsense.
 *
 * An audience is mostly rows of seats, which a rectangle says badly, so a
 * block can now be a row of N seats (`kind = 'seats'`): drawn as chairs,
 * sized by its width, counted in the inspector.
 *
 * Every layout already drawn is on the Stage, so it says so.
 *
 * ## Releases
 *
 * When something new lands, the app says so once, to each person, the
 * next time they open it — remembered on the account (beside the tour,
 * on `onboarding`), so it follows them to a new phone and never nags on
 * the old one. The words live in the app (lib/releases); the database
 * only remembers which keys were seen.
 */

-- ---------------------------------------------------------------------------
-- Areas
-- ---------------------------------------------------------------------------

create table if not exists public.stage_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 40),
  width integer not null default 1200 check (width between 400 and 4000),
  height integer not null default 700 check (height between 300 and 4000),
  -- What the far edge and the near edge are, from where the drawing is read.
  top_label text not null default 'Back' check (char_length(top_label) <= 40),
  bottom_label text not null default 'Front' check (char_length(bottom_label) <= 40),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.stage_areas is
  'The places a session can carry a layout for: the stage, the hall, and whatever else the church names. Settings › Stage layout.';

alter table public.stage_areas enable row level security;
revoke all on public.stage_areas from anon;

create policy stage_areas_select on public.stage_areas
  for select using ((select auth.uid()) is not null);
create policy stage_areas_admin_write on public.stage_areas
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.stage_areas (name, width, height, top_label, bottom_label, position)
values ('Stage', 1200, 700, 'Back of stage', 'Front · congregation', 0),
       ('Audience', 1200, 900, 'Stage', 'Back of hall', 1)
on conflict (name) do nothing;

-- Every layout and template so far was a stage.
alter table public.stage_layouts add column if not exists area_id uuid references public.stage_areas(id) on delete cascade;
update public.stage_layouts set area_id = (select id from public.stage_areas where name = 'Stage') where area_id is null;
alter table public.stage_layouts alter column area_id set not null;
alter table public.stage_layouts drop constraint if exists stage_layouts_session_id_key;
alter table public.stage_layouts add constraint stage_layouts_one_per_area unique (session_id, area_id);

alter table public.stage_templates add column if not exists area_id uuid references public.stage_areas(id) on delete cascade;
update public.stage_templates set area_id = (select id from public.stage_areas where name = 'Stage') where area_id is null;
alter table public.stage_templates alter column area_id set not null;
-- A name is unique within its area: "Full band" on the stage and in the hall are different shapes.
alter table public.stage_templates drop constraint if exists stage_templates_name_key;
alter table public.stage_templates add constraint stage_templates_name_per_area unique (area_id, name);

alter table public.stage_template_requests add column if not exists area_id uuid references public.stage_areas(id) on delete cascade;
update public.stage_template_requests set area_id = (select id from public.stage_areas where name = 'Stage') where area_id is null;
alter table public.stage_template_requests alter column area_id set not null;

-- A block, or a row of seats.
alter table public.stage_blocks
  add column if not exists kind text not null default 'block' check (kind in ('block', 'seats')),
  add column if not exists seats smallint not null default 0 check (seats between 0 and 60);

-- The insert policy on layouts also has to know the area exists; the
-- foreign key does that. The shape of a layout carries kind and seats now.
create or replace function public.stage_layout_shape(lay uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', b.label, 'color', b.color, 'x', b.x, 'y', b.y, 'w', b.w, 'h', b.h, 'rotation', b.rotation,
    'kind', b.kind, 'seats', b.seats
  ) order by b.z, b.placed_at), '[]'::jsonb)
  from public.stage_blocks b where b.layout_id = lay;
$$;

-- The functions that took a session now take an area too. The old shapes go.
drop function if exists public.save_stage_template(uuid, text);
drop function if exists public.apply_stage_template(uuid, uuid);
drop function if exists public.clear_stage_layout(uuid);

create or replace function public.save_stage_template(p_session uuid, p_area uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  lay public.stage_layouts%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  req uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(v_name) between 1 and 60 is not true then
    raise exception 'Give the template a name of up to 60 characters.' using errcode = '22023';
  end if;
  select * into lay from public.stage_layouts where session_id = p_session and area_id = p_area;
  if not found then
    raise exception 'There is no layout for that area yet.' using errcode = '22023';
  end if;
  if not public.can_open_page(auth.uid(), 'stage') then
    raise exception 'You cannot open stage layouts.' using errcode = '42501';
  end if;

  if public.stage_may(auth.uid(), 'templates') then
    insert into public.stage_templates (name, area_id, width, height, blocks, created_by)
    values (v_name, p_area, lay.width, lay.height, public.stage_layout_shape(lay.id), auth.uid())
    on conflict (area_id, name) do update
      set width = excluded.width, height = excluded.height, blocks = excluded.blocks, updated_at = now();
    return 'saved';
  end if;

  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'Only somebody who can edit the layout can ask to keep it.' using errcode = '42501';
  end if;
  insert into public.stage_template_requests (name, area_id, width, height, blocks, requested_by)
  values (v_name, p_area, lay.width, lay.height, public.stage_layout_shape(lay.id), auth.uid())
  returning id into req;

  insert into public.notifications (user_id, type, reference_id)
  select distinct u.user_id, 'stage_template_request', req
  from (
    select r.user_id from public.user_roles r where r.role_type = 'admin'
    union select o.user_id from public.app_owner o
  ) u
  where u.user_id <> auth.uid();
  return 'requested';
end;
$$;

revoke all on function public.save_stage_template(uuid, uuid, text) from public, anon;
grant execute on function public.save_stage_template(uuid, uuid, text) to authenticated;

create or replace function public.decide_stage_template_request(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.stage_template_requests%rowtype;
  final_name text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can answer a template request.' using errcode = '42501';
  end if;
  select * into r from public.stage_template_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'That request has already been answered.' using errcode = '22023';
  end if;

  if p_approve then
    final_name := r.name;
    if exists (select 1 from public.stage_templates t where t.area_id = r.area_id and t.name = final_name) then
      final_name := left(r.name, 54) || ' (' || to_char(now(), 'DD Mon') || ')';
    end if;
    insert into public.stage_templates (name, area_id, width, height, blocks, created_by)
    values (final_name, r.area_id, r.width, r.height, r.blocks, r.requested_by)
    on conflict (area_id, name) do update set blocks = excluded.blocks, updated_at = now();
  end if;

  update public.stage_template_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_request;

  if r.requested_by is not null and r.requested_by <> auth.uid() then
    insert into public.notifications (user_id, type, reference_id)
    values (r.requested_by, 'stage_template_decided', p_request);
  end if;
end;
$$;

create or replace function public.apply_stage_template(p_session uuid, p_area uuid, p_template uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.stage_templates%rowtype;
  svc uuid;
  lay uuid;
  replaced integer;
  b jsonb;
  i integer := 0;
begin
  select * into t from public.stage_templates where id = p_template;
  if not found then
    raise exception 'That template is gone.' using errcode = '22023';
  end if;
  if t.area_id <> p_area then
    raise exception 'That template is for another area.' using errcode = '22023';
  end if;
  select service_id into svc from public.service_sessions where id = p_session;
  if svc is null then
    raise exception 'There is no such session.' using errcode = '22023';
  end if;
  if public.service_has_finished(svc) then
    raise exception 'That service has finished.' using errcode = '42501';
  end if;
  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'You cannot change this layout.' using errcode = '42501';
  end if;

  select id into lay from public.stage_layouts where session_id = p_session and area_id = p_area;
  if lay is null then
    insert into public.stage_layouts (session_id, area_id, service_id, width, height, created_by)
    values (p_session, p_area, svc, t.width, t.height, auth.uid())
    returning id into lay;
    replaced := 0;
  else
    select count(*) into replaced from public.stage_blocks where layout_id = lay;
    if replaced > 0 and not public.stage_may(auth.uid(), 'delete') then
      raise exception 'Applying a template replaces what is there, which you cannot delete.' using errcode = '42501';
    end if;
    update public.stage_layouts set width = t.width, height = t.height, updated_at = now() where id = lay;
  end if;

  perform set_config('rim.stage_quiet', 'on', true);
  delete from public.stage_blocks where layout_id = lay;
  for b in select value from jsonb_array_elements(t.blocks) loop
    i := i + 1;
    insert into public.stage_blocks (layout_id, label, color, x, y, w, h, rotation, z, kind, seats)
    values (lay, left(b ->> 'label', 40), coalesce(b ->> 'color', '#0A84FF'),
            greatest(0, (b ->> 'x')::numeric), greatest(0, (b ->> 'y')::numeric),
            least(4000, greatest(40, (b ->> 'w')::numeric)), least(4000, greatest(40, (b ->> 'h')::numeric)),
            coalesce((b ->> 'rotation')::smallint, 0), i,
            case when b ->> 'kind' = 'seats' then 'seats' else 'block' end,
            least(60, greatest(0, coalesce((b ->> 'seats')::smallint, 0))));
  end loop;
  perform set_config('rim.stage_quiet', 'off', true);

  insert into public.stage_layout_log (layout_id, kind, detail, by)
  values (lay, 'template_applied', jsonb_build_object('name', t.name, 'blocks', i, 'replaced', replaced), auth.uid());
  return lay;
end;
$$;

revoke all on function public.apply_stage_template(uuid, uuid, uuid) from public, anon;
grant execute on function public.apply_stage_template(uuid, uuid, uuid) to authenticated;

create or replace function public.clear_stage_layout(p_session uuid, p_area uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lay public.stage_layouts%rowtype;
  n integer;
begin
  select * into lay from public.stage_layouts where session_id = p_session and area_id = p_area;
  if not found then
    return;
  end if;
  if public.service_has_finished(lay.service_id) or not public.stage_may(auth.uid(), 'delete') then
    raise exception 'You cannot clear this layout.' using errcode = '42501';
  end if;
  perform set_config('rim.stage_quiet', 'on', true);
  delete from public.stage_blocks where layout_id = lay.id;
  get diagnostics n = row_count;
  perform set_config('rim.stage_quiet', 'off', true);
  insert into public.stage_layout_log (layout_id, kind, detail, by)
  values (lay.id, 'cleared', jsonb_build_object('blocks', n), auth.uid());
end;
$$;

revoke all on function public.clear_stage_layout(uuid, uuid) from public, anon;
grant execute on function public.clear_stage_layout(uuid, uuid) to authenticated;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stage_areas'
     ) then
    alter publication supabase_realtime add table public.stage_areas;
  end if;
end $pub$;

-- ---------------------------------------------------------------------------
-- Releases: seen once, on the account
-- ---------------------------------------------------------------------------

alter table public.onboarding
  add column if not exists releases_seen jsonb not null default '{}'::jsonb
    check (jsonb_typeof(releases_seen) = 'object');

comment on column public.onboarding.releases_seen is
  'Release keys this person has had announced, each with when. The words are the app''s (lib/releases).';

create or replace function public.release_mark_seen(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^[a-z0-9_-]{1,60}$' then
    raise exception 'That is not a release key.' using errcode = '22023';
  end if;
  insert into public.onboarding (user_id, releases_seen, updated_at)
  values (me, jsonb_build_object(p_key, now()), now())
  on conflict (user_id) do update
    set releases_seen = public.onboarding.releases_seen || excluded.releases_seen,
        updated_at = now();
end;
$$;

revoke all on function public.release_mark_seen(text) from public, anon;
grant execute on function public.release_mark_seen(text) to authenticated;

notify pgrst, 'reload schema';

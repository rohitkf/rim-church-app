/*
 * One workspace for the whole service.
 *
 * A layout was made per running-order session, with the stage and the
 * hall as two separate drawings. That was the wrong grain twice over: a
 * running order has a dozen slots and the band does not move between
 * Worship 1 and Worship 2, and the people at the sound desk are in the
 * same room as the people on the stage. So a layout now belongs to the
 * **service** — one per Sunday service — and the areas (Stage, Audience,
 * whatever the church names) are regions of one canvas, drawn top to
 * bottom in their set order. A block says which region it is in, with
 * its place measured from that region's corner, so resizing the hall in
 * Settings does not shift the drums.
 *
 * Templates are the whole workspace: every region's blocks, each tagged
 * with its region's name, matched by name when applied (a region the
 * church has since renamed lands in the first region rather than nowhere).
 *
 * Where a service had more than one session's layout, the first drawn is
 * kept and the rest go — written before anybody had drawn one.
 */

-- ---------------------------------------------------------------------------
-- A layout belongs to a service
-- ---------------------------------------------------------------------------

-- Blocks learn their region before layouts forget theirs.
alter table public.stage_blocks add column if not exists area_id uuid references public.stage_areas(id) on delete cascade;
update public.stage_blocks b set area_id = l.area_id from public.stage_layouts l where l.id = b.layout_id and b.area_id is null;
update public.stage_blocks set area_id = (select id from public.stage_areas order by position, name limit 1) where area_id is null;
alter table public.stage_blocks alter column area_id set not null;
create index if not exists stage_blocks_area_idx on public.stage_blocks (area_id);

-- Fold each service's layouts into its first: move the blocks, comments
-- and log lines across, then drop the rest.
with ranked as (
  select id, service_id, row_number() over (partition by service_id order by created_at, id) as n
  from public.stage_layouts
), keep as (select id, service_id from ranked where n = 1), extra as (select r.id, k.id as into_id from ranked r join keep k on k.service_id = r.service_id where r.n > 1)
update public.stage_blocks b set layout_id = e.into_id from extra e where b.layout_id = e.id;
with ranked as (
  select id, service_id, row_number() over (partition by service_id order by created_at, id) as n
  from public.stage_layouts
), keep as (select id, service_id from ranked where n = 1), extra as (select r.id, k.id as into_id from ranked r join keep k on k.service_id = r.service_id where r.n > 1)
update public.stage_comments c set layout_id = e.into_id from extra e where c.layout_id = e.id;
with ranked as (
  select id, service_id, row_number() over (partition by service_id order by created_at, id) as n
  from public.stage_layouts
), keep as (select id, service_id from ranked where n = 1), extra as (select r.id, k.id as into_id from ranked r join keep k on k.service_id = r.service_id where r.n > 1)
update public.stage_layout_log g set layout_id = e.into_id from extra e where g.layout_id = e.id;
with ranked as (
  select id, service_id, row_number() over (partition by service_id order by created_at, id) as n
  from public.stage_layouts
), keep as (select id, service_id from ranked where n = 1), extra as (select r.id, k.id as into_id from ranked r join keep k on k.service_id = r.service_id where r.n > 1)
update public.stage_move_requests m set layout_id = e.into_id from extra e where m.layout_id = e.id;
delete from public.stage_layouts l
using (
  select id from (
    select id, row_number() over (partition by service_id order by created_at, id) as n from public.stage_layouts
  ) r where r.n > 1
) gone
where l.id = gone.id;

-- The insert policy named the columns about to go, so it is remade first.
drop policy if exists stage_layouts_insert on public.stage_layouts;
create policy stage_layouts_insert on public.stage_layouts
  for insert with check (
    not public.service_has_finished(service_id)
    and (public.stage_may(auth.uid(), 'add') or public.stage_may(auth.uid(), 'edit'))
  );

alter table public.stage_layouts drop constraint if exists stage_layouts_one_per_area;
alter table public.stage_layouts drop column if exists session_id;
alter table public.stage_layouts drop column if exists area_id;
alter table public.stage_layouts drop column if exists width;
alter table public.stage_layouts drop column if exists height;
alter table public.stage_layouts add constraint stage_layouts_one_per_service unique (service_id);

comment on table public.stage_layouts is
  'One stage layout per service: every area the church has named, in one workspace. Cleared on the church''s stage clear day once the service has been held.';

-- Templates and asks are the whole workspace.
alter table public.stage_templates drop constraint if exists stage_templates_name_per_area;
alter table public.stage_templates drop column if exists area_id;
alter table public.stage_templates drop column if exists width;
alter table public.stage_templates drop column if exists height;
alter table public.stage_templates add constraint stage_templates_name_key unique (name);
alter table public.stage_template_requests drop column if exists area_id;
alter table public.stage_template_requests drop column if exists width;
alter table public.stage_template_requests drop column if exists height;

-- ---------------------------------------------------------------------------
-- The functions, by service
-- ---------------------------------------------------------------------------

create or replace function public.stage_layout_shape(lay uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'area', a.name, 'label', b.label, 'color', b.color, 'x', b.x, 'y', b.y, 'w', b.w, 'h', b.h,
    'rotation', b.rotation, 'kind', b.kind, 'seats', b.seats
  ) order by a.position, b.z, b.placed_at), '[]'::jsonb)
  from public.stage_blocks b join public.stage_areas a on a.id = b.area_id
  where b.layout_id = lay;
$$;

drop function if exists public.save_stage_template(uuid, uuid, text);
drop function if exists public.apply_stage_template(uuid, uuid, uuid);
drop function if exists public.clear_stage_layout(uuid, uuid);

create or replace function public.save_stage_template(p_service uuid, p_name text)
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
  select * into lay from public.stage_layouts where service_id = p_service;
  if not found then
    raise exception 'There is no layout for that service yet.' using errcode = '22023';
  end if;
  if not public.can_open_page(auth.uid(), 'stage') then
    raise exception 'You cannot open stage layouts.' using errcode = '42501';
  end if;

  if public.stage_may(auth.uid(), 'templates') then
    insert into public.stage_templates (name, blocks, created_by)
    values (v_name, public.stage_layout_shape(lay.id), auth.uid())
    on conflict (name) do update set blocks = excluded.blocks, updated_at = now();
    return 'saved';
  end if;

  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'Only somebody who can edit the layout can ask to keep it.' using errcode = '42501';
  end if;
  insert into public.stage_template_requests (name, blocks, requested_by)
  values (v_name, public.stage_layout_shape(lay.id), auth.uid())
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

revoke all on function public.save_stage_template(uuid, text) from public, anon;
grant execute on function public.save_stage_template(uuid, text) to authenticated;

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
    if exists (select 1 from public.stage_templates t where t.name = final_name) then
      final_name := left(r.name, 54) || ' (' || to_char(now(), 'DD Mon') || ')';
    end if;
    insert into public.stage_templates (name, blocks, created_by)
    values (final_name, r.blocks, r.requested_by)
    on conflict (name) do update set blocks = excluded.blocks, updated_at = now();
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

create or replace function public.apply_stage_template(p_service uuid, p_template uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.stage_templates%rowtype;
  lay uuid;
  replaced integer;
  b jsonb;
  i integer := 0;
  first_area uuid;
  area uuid;
begin
  select * into t from public.stage_templates where id = p_template;
  if not found then
    raise exception 'That template is gone.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service) then
    raise exception 'There is no such service.' using errcode = '22023';
  end if;
  if public.service_has_finished(p_service) then
    raise exception 'That service has finished.' using errcode = '42501';
  end if;
  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'You cannot change this layout.' using errcode = '42501';
  end if;
  select id into first_area from public.stage_areas order by position, name limit 1;
  if first_area is null then
    raise exception 'There are no areas to lay out.' using errcode = '22023';
  end if;

  select id into lay from public.stage_layouts where service_id = p_service;
  if lay is null then
    insert into public.stage_layouts (service_id, created_by) values (p_service, auth.uid()) returning id into lay;
    replaced := 0;
  else
    select count(*) into replaced from public.stage_blocks where layout_id = lay;
    if replaced > 0 and not public.stage_may(auth.uid(), 'delete') then
      raise exception 'Applying a template replaces what is there, which you cannot delete.' using errcode = '42501';
    end if;
    update public.stage_layouts set updated_at = now() where id = lay;
  end if;

  perform set_config('rim.stage_quiet', 'on', true);
  delete from public.stage_blocks where layout_id = lay;
  for b in select value from jsonb_array_elements(t.blocks) loop
    i := i + 1;
    select id into area from public.stage_areas where name = b ->> 'area';
    insert into public.stage_blocks (layout_id, area_id, label, color, x, y, w, h, rotation, z, kind, seats)
    values (lay, coalesce(area, first_area), left(b ->> 'label', 40), coalesce(b ->> 'color', '#0A84FF'),
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

revoke all on function public.apply_stage_template(uuid, uuid) from public, anon;
grant execute on function public.apply_stage_template(uuid, uuid) to authenticated;

create or replace function public.clear_stage_layout(p_service uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lay public.stage_layouts%rowtype;
  n integer;
begin
  select * into lay from public.stage_layouts where service_id = p_service;
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

revoke all on function public.clear_stage_layout(uuid) from public, anon;
grant execute on function public.clear_stage_layout(uuid) to authenticated;

notify pgrst, 'reload schema';

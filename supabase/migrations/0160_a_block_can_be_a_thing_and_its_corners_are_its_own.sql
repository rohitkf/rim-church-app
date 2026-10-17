/*
 * A block can be a thing, and its corners are its own.
 *
 * Two asks from the people drawing stages. First, blocks had rounded
 * corners, as the app's surfaces do, but a stage plan reads better square:
 * corners are now `sharp` by default, and a block can be set `rounded` on
 * its own. Second, not everything on a stage is a person's place: a camera
 * on its tripod, a carpet, a door, a plant. A block can now be an item
 * (`kind = 'item'`) drawn as a line picture named by `icon`; the pictures
 * themselves live in the app (lib/stageIcons.ts), so a key the app no
 * longer knows is drawn as a plain box with its name, never an error.
 *
 * Both travel with a template: the shape carries them, and applying one
 * puts them back.
 */

alter table public.stage_blocks
  add column if not exists corners text not null default 'sharp' check (corners in ('sharp', 'rounded')),
  add column if not exists icon text check (icon ~ '^[a-z][a-z0-9-]{0,31}$');

alter table public.stage_blocks drop constraint if exists stage_blocks_kind_check;
alter table public.stage_blocks add constraint stage_blocks_kind_check check (kind in ('block', 'seats', 'item'));
alter table public.stage_blocks drop constraint if exists stage_blocks_item_has_icon;
alter table public.stage_blocks add constraint stage_blocks_item_has_icon check (kind <> 'item' or icon is not null);

comment on column public.stage_blocks.corners is 'sharp (the default) or rounded; the block''s own.';
comment on column public.stage_blocks.icon is 'For an item: which picture (a key the app knows — lib/stageIcons.ts).';

create or replace function public.stage_layout_shape(lay uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'area', a.name, 'label', b.label, 'color', b.color, 'x', b.x, 'y', b.y, 'w', b.w, 'h', b.h,
    'rotation', b.rotation, 'kind', b.kind, 'seats', b.seats, 'corners', b.corners, 'icon', b.icon
  ) order by a.position, b.z, b.placed_at), '[]'::jsonb)
  from public.stage_blocks b join public.stage_areas a on a.id = b.area_id
  where b.layout_id = lay;
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
  locked text;
  b jsonb;
  i integer := 0;
  first_area uuid;
  area uuid;
  kind text;
  icon text;
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
    locked := public.stage_locked_labels(lay);
    if locked is not null then
      raise exception 'Applying a template replaces what is there, and % is locked. Unlock first.', locked using errcode = '42501';
    end if;
    update public.stage_layouts set updated_at = now() where id = lay;
  end if;

  perform set_config('rim.stage_quiet', 'on', true);
  delete from public.stage_blocks where layout_id = lay;
  for b in select value from jsonb_array_elements(t.blocks) loop
    i := i + 1;
    select id into area from public.stage_areas where name = b ->> 'area';
    -- An item with no picture (an old or hand-edited shape) is a plain block.
    icon := case when (b ->> 'icon') ~ '^[a-z][a-z0-9-]{0,31}$' then b ->> 'icon' end;
    kind := case
      when b ->> 'kind' = 'seats' then 'seats'
      when b ->> 'kind' = 'item' and icon is not null then 'item'
      else 'block' end;
    insert into public.stage_blocks (layout_id, area_id, label, color, x, y, w, h, rotation, z, kind, seats, corners, icon)
    values (lay, coalesce(area, first_area), left(b ->> 'label', 40), coalesce(b ->> 'color', '#0A84FF'),
            greatest(0, (b ->> 'x')::numeric), greatest(0, (b ->> 'y')::numeric),
            least(4000, greatest(40, (b ->> 'w')::numeric)), least(4000, greatest(40, (b ->> 'h')::numeric)),
            coalesce((b ->> 'rotation')::smallint, 0), i,
            kind,
            least(60, greatest(0, coalesce((b ->> 'seats')::smallint, 0))),
            case when b ->> 'corners' = 'rounded' then 'rounded' else 'sharp' end,
            case when kind = 'item' then icon end);
  end loop;
  perform set_config('rim.stage_quiet', 'off', true);

  insert into public.stage_layout_log (layout_id, kind, detail, by)
  values (lay, 'template_applied', jsonb_build_object('name', t.name, 'blocks', i, 'replaced', replaced), auth.uid());
  return lay;
end;
$$;

revoke all on function public.apply_stage_template(uuid, uuid) from public, anon;
grant execute on function public.apply_stage_template(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

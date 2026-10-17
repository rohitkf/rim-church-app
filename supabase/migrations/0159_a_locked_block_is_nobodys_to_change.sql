/*
 * A locked block is nobody's to change, the Admin who locked it included.
 *
 * 0157 let an Admin move, edit and delete a locked block straight off, as
 * if the lock were only for everybody else. It is not: a lock says "this
 * stays", and the way to change a locked block is to unlock it first (Lock
 * ↔ Unlock on the block itself, which the log records). So the update and
 * delete policies now stop at the lock for everyone. Moving a locked block
 * by approving an ask still works, since that is the lock's own door
 * (decide_stage_move runs as the table's owner).
 *
 * Applying a template or clearing a layout replaces every block on it,
 * so either is refused while a block is locked, with a word saying which
 * to unlock. The weekly clear, which deletes the finished layouts whole,
 * is not touched: by then the lock has done its work.
 */

drop policy if exists stage_blocks_update on public.stage_blocks;
create policy stage_blocks_update on public.stage_blocks
  for update using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'edit')
    and locked_at is null
  ) with check (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'edit')
    and locked_at is null
  );

drop policy if exists stage_blocks_delete on public.stage_blocks;
create policy stage_blocks_delete on public.stage_blocks
  for delete using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'delete')
    and locked_at is null
  );

/** The names of the locked blocks on a layout, for a refusal that says which to unlock. */
create or replace function public.stage_locked_labels(lay uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(label, ', ' order by label) from public.stage_blocks where layout_id = lay and locked_at is not null
$$;
revoke all on function public.stage_locked_labels(uuid) from public, anon, authenticated;

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
  locked text;
  n integer;
begin
  select * into lay from public.stage_layouts where service_id = p_service;
  if not found then
    return;
  end if;
  if public.service_has_finished(lay.service_id) or not public.stage_may(auth.uid(), 'delete') then
    raise exception 'You cannot clear this layout.' using errcode = '42501';
  end if;
  locked := public.stage_locked_labels(lay.id);
  if locked is not null then
    raise exception 'Clearing removes every block, and % is locked. Unlock first.', locked using errcode = '42501';
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

/*
 * The stage is laid out before Sunday.
 *
 * Where the keyboard goes, which side the backing vocals stand, where the
 * drum shield is: it is decided on a Saturday night in a chat thread, and
 * by the morning half the band has a different picture of it. So each
 * session of a service can carry a layout — named blocks on a drawn
 * stage, each one optionally with a person on it — that everyone opens
 * and sees the same.
 *
 * Six tables, and what each is for:
 *
 *   stage_team_access         which teams may draw, and what each may do:
 *                             add blocks, edit them, delete them, comment,
 *                             and keep the template library. Set in
 *                             Settings › Stage layout. Admins and the
 *                             Owner always may; everybody signed in may
 *                             look (within the page's own access rule).
 *   stage_layouts             one per session, made the first time
 *                             somebody draws on it. Goes with its session.
 *   stage_blocks              the things on the stage. Each remembers who
 *                             put it there and who last moved it.
 *   stage_comments            a thread under the stage, and notes pinned
 *                             to a block (block_id set).
 *   stage_layout_log          every change, written by triggers and by
 *                             nobody's hand: added, moved, resized,
 *                             renamed, recoloured, given a person,
 *                             deleted, commented, a template applied.
 *   stage_templates           layouts kept for next time. Saving one
 *                             straight into the library takes the
 *                             templates privilege; anybody who may edit
 *                             can ask instead (stage_template_requests),
 *                             and an Admin says yes or no.
 *
 * The layouts clear on a day and hour of the church's choosing (Tuesday at
 * 03:00 by default, in the church's own timezone): every layout whose
 * service has been held goes, with its comments and its log. Templates
 * stay. A layout also goes with its service on the 14-day clock (0128),
 * whichever comes first.
 *
 * Like the rota, a layout is a record once the service is over:
 * `service_has_finished` guards every write.
 */

-- ---------------------------------------------------------------------------
-- Settings: the clear day and hour
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists stage_clear_dow smallint default 2
    check (stage_clear_dow is null or stage_clear_dow between 0 and 6),
  add column if not exists stage_clear_hour smallint not null default 3
    check (stage_clear_hour between 0 and 23);

-- ---------------------------------------------------------------------------
-- Who may draw
-- ---------------------------------------------------------------------------

create table if not exists public.stage_team_access (
  department_id uuid primary key references public.departments(id) on delete cascade,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_comment boolean not null default false,
  can_templates boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.stage_team_access is
  'Which teams may work on stage layouts, and what each may do. Admins and the Owner always may.';

alter table public.stage_team_access enable row level security;

create policy stage_team_access_select on public.stage_team_access
  for select using ((select auth.uid()) is not null);

-- Settings are the Admin's (and the Owner is an Admin, 0035).
create policy stage_team_access_admin_write on public.stage_team_access
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

revoke all on public.stage_team_access from anon;

/*
 * May this person do this to a stage layout?
 *
 * add · edit · delete · comment · templates. The Owner and Admins always;
 * everybody else through a team they are on (or lead) that the church has
 * given it to.
 */
create or replace function public.stage_may(uid uuid, priv text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or exists (
      select 1 from public.stage_team_access a
      where (public.is_dept_member(uid, a.department_id)
             or public.is_dept_head_or_assisting(uid, a.department_id))
        and case priv
          when 'add' then a.can_add
          when 'edit' then a.can_edit
          when 'delete' then a.can_delete
          when 'comment' then a.can_comment
          when 'templates' then a.can_templates
          else false
        end
    )
  );
$$;

revoke all on function public.stage_may(uuid, text) from public, anon;
grant execute on function public.stage_may(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The page itself: open to everybody signed in, unless the church narrows it
-- ---------------------------------------------------------------------------

create or replace function public.page_access_is_valid(access jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(access) = 'object'
    and pg_column_size(access) <= 4096
    and not exists (
      select 1
      from jsonb_each(access) as e(page, level)
      where jsonb_typeof(e.level) <> 'string'
         or e.level #>> '{}' <> all (
              case e.page
                when 'service-planner' then array['everyone', 'team', 'leads']
                when 'rota'            then array['everyone', 'team']
                when 'set-lists'       then array['everyone', 'team', 'leads']
                when 'debriefs'        then array['team', 'leads']
                when 'messages'        then array['everyone', 'team', 'leads']
                when 'updates'         then array['everyone', 'team', 'leads']
                when 'polls'           then array['everyone', 'team']
                when 'events'          then array['everyone', 'team', 'leads']
                when 'giving'          then array['everyone', 'team', 'leads']
                when 'departments'     then array['everyone', 'team']
                when 'inventory'       then array['team', 'leads']
                when 'stage'           then array['everyone', 'team', 'leads']
                else array[]::text[]
              end
            )
    );
$$;

create or replace function public.page_level(page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.page_access ->> page from public.app_settings s limit 1),
    case page
      when 'service-planner' then 'everyone'
      when 'set-lists'       then 'everyone'
      when 'updates'         then 'everyone'
      when 'polls'           then 'everyone'
      when 'events'          then 'everyone'
      when 'giving'          then 'everyone'
      when 'departments'     then 'everyone'
      when 'stage'           then 'everyone'
      else 'team'
    end
  );
$$;

-- ---------------------------------------------------------------------------
-- The layout, and what is on it
-- ---------------------------------------------------------------------------

create table if not exists public.stage_layouts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.service_sessions(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  width integer not null default 1200 check (width between 400 and 4000),
  height integer not null default 700 check (height between 300 and 4000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stage_layouts is
  'One stage layout per session of a service. Cleared on the church''s stage clear day once the service has been held.';

create index if not exists stage_layouts_service_idx on public.stage_layouts (service_id);

create table if not exists public.stage_blocks (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.stage_layouts(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  person_id uuid references public.profiles(id) on delete set null,
  color text not null default '#0A84FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  x numeric not null check (x >= 0),
  y numeric not null check (y >= 0),
  w numeric not null check (w between 40 and 4000),
  h numeric not null check (h between 40 and 4000),
  rotation smallint not null default 0 check (rotation between -180 and 180),
  z integer not null default 0,
  placed_by uuid references public.profiles(id) on delete set null,
  placed_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists stage_blocks_layout_idx on public.stage_blocks (layout_id);

create table if not exists public.stage_comments (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.stage_layouts(id) on delete cascade,
  -- Set for a note pinned to one block; null for the thread under the stage.
  block_id uuid references public.stage_blocks(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  author uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stage_comments_layout_idx on public.stage_comments (layout_id, created_at);

create table if not exists public.stage_layout_log (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.stage_layouts(id) on delete cascade,
  -- Not a foreign key: the line about a deleted block outlives the block.
  block_id uuid,
  block_label text,
  kind text not null check (kind in (
    'added', 'moved', 'resized', 'rotated', 'renamed', 'recoloured', 'assigned',
    'deleted', 'commented', 'template_applied', 'cleared'
  )),
  detail jsonb not null default '{}'::jsonb,
  by uuid references public.profiles(id) on delete set null,
  at timestamptz not null default now()
);

comment on table public.stage_layout_log is
  'Every change to a stage layout: what, to which block, by whom, when. Written by triggers only; goes with the layout.';

create index if not exists stage_layout_log_layout_idx on public.stage_layout_log (layout_id, at desc);

alter table public.stage_layouts enable row level security;
alter table public.stage_blocks enable row level security;
alter table public.stage_comments enable row level security;
alter table public.stage_layout_log enable row level security;

revoke all on public.stage_layouts, public.stage_blocks, public.stage_comments, public.stage_layout_log from anon;
revoke insert, update, delete, truncate on public.stage_layout_log from authenticated;

-- Looking: whoever may open the page.
create policy stage_layouts_select on public.stage_layouts
  for select using ((select public.can_open_page(auth.uid(), 'stage')));
create policy stage_blocks_select on public.stage_blocks
  for select using ((select public.can_open_page(auth.uid(), 'stage')));
create policy stage_comments_select on public.stage_comments
  for select using ((select public.can_open_page(auth.uid(), 'stage')));
create policy stage_layout_log_select on public.stage_layout_log
  for select using ((select public.can_open_page(auth.uid(), 'stage')));

/*
 * The service a layout belongs to, for the policies on blocks and
 * comments, which know only their layout.
 */
create or replace function public.stage_layout_service(lay uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select service_id from public.stage_layouts where id = lay;
$$;

revoke all on function public.stage_layout_service(uuid) from public, anon;
grant execute on function public.stage_layout_service(uuid) to authenticated;

-- A layout appears when somebody first draws, and goes when somebody clears it.
create policy stage_layouts_insert on public.stage_layouts
  for insert with check (
    not public.service_has_finished(service_id)
    and (public.stage_may(auth.uid(), 'add') or public.stage_may(auth.uid(), 'edit'))
    and exists (select 1 from public.service_sessions s where s.id = session_id and s.service_id = stage_layouts.service_id)
  );
create policy stage_layouts_update on public.stage_layouts
  for update using (not public.service_has_finished(service_id) and public.stage_may(auth.uid(), 'edit'))
  with check (not public.service_has_finished(service_id) and public.stage_may(auth.uid(), 'edit'));
create policy stage_layouts_delete on public.stage_layouts
  for delete using (not public.service_has_finished(service_id) and public.stage_may(auth.uid(), 'delete'));

create policy stage_blocks_insert on public.stage_blocks
  for insert with check (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'add')
  );
create policy stage_blocks_update on public.stage_blocks
  for update using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'edit')
  ) with check (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'edit')
  );
create policy stage_blocks_delete on public.stage_blocks
  for delete using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'delete')
  );

create policy stage_comments_insert on public.stage_comments
  for insert with check (
    author = auth.uid()
    and not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'comment')
  );
-- Your own, or anybody's with the delete privilege.
create policy stage_comments_delete on public.stage_comments
  for delete using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and (author = auth.uid() or public.stage_may(auth.uid(), 'delete'))
  );

-- ---------------------------------------------------------------------------
-- Who did it, and the log
-- ---------------------------------------------------------------------------

/*
 * The first and last hands on a block, set here rather than trusted from
 * the client — a form cannot claim somebody else placed it.
 */
create or replace function public.stage_block_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.placed_by := auth.uid();
    new.placed_at := now();
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    new.placed_by := old.placed_by;
    new.placed_at := old.placed_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    update public.stage_layouts set updated_at = now() where id = new.layout_id;
  end if;
  return new;
end;
$$;

drop trigger if exists stage_block_stamp on public.stage_blocks;
create trigger stage_block_stamp
  before insert or update on public.stage_blocks
  for each row execute function public.stage_block_stamp();

/*
 * One line per change. A block being deleted with its layout writes
 * nothing: the layout is already gone, so the line would have nowhere to
 * point. Applying a template says so once rather than once per block
 * (`rim.stage_quiet`, set by the function that does it).
 */
create or replace function public.stage_block_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lay uuid := coalesce(new.layout_id, old.layout_id);
  kinds text[] := '{}';
  details jsonb := '{}'::jsonb;
  k text;
begin
  if coalesce(current_setting('rim.stage_quiet', true), '') = 'on' then
    return null;
  end if;
  if not exists (select 1 from public.stage_layouts l where l.id = lay) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
    values (lay, new.id, new.label, 'added',
            jsonb_build_object('person', new.person_id, 'color', new.color), auth.uid());
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
    values (lay, old.id, old.label, 'deleted', jsonb_build_object('person', old.person_id), auth.uid());
    return null;
  end if;

  if new.x is distinct from old.x or new.y is distinct from old.y then
    kinds := array_append(kinds, 'moved');
    details := details || jsonb_build_object('from', jsonb_build_array(old.x, old.y), 'to', jsonb_build_array(new.x, new.y));
  end if;
  if new.w is distinct from old.w or new.h is distinct from old.h then
    kinds := array_append(kinds, 'resized');
    details := details || jsonb_build_object('size_from', jsonb_build_array(old.w, old.h), 'size_to', jsonb_build_array(new.w, new.h));
  end if;
  if new.rotation is distinct from old.rotation then
    kinds := array_append(kinds, 'rotated');
    details := details || jsonb_build_object('rotation', new.rotation);
  end if;
  if new.label is distinct from old.label then
    kinds := array_append(kinds, 'renamed');
    details := details || jsonb_build_object('was', old.label);
  end if;
  if new.color is distinct from old.color then
    kinds := array_append(kinds, 'recoloured');
    details := details || jsonb_build_object('color', new.color);
  end if;
  if new.person_id is distinct from old.person_id then
    kinds := array_append(kinds, 'assigned');
    details := details || jsonb_build_object('person', new.person_id, 'person_was', old.person_id);
  end if;

  foreach k in array kinds loop
    insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
    values (lay, new.id, new.label, k, details, auth.uid());
  end loop;
  return null;
end;
$$;

drop trigger if exists stage_block_log on public.stage_blocks;
create trigger stage_block_log
  after insert or update or delete on public.stage_blocks
  for each row execute function public.stage_block_log();

create or replace function public.stage_comment_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.stage_layouts l where l.id = new.layout_id) then
    insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
    values (new.layout_id, new.block_id,
            (select b.label from public.stage_blocks b where b.id = new.block_id),
            'commented', jsonb_build_object('body', left(new.body, 120)), auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists stage_comment_log on public.stage_comments;
create trigger stage_comment_log
  after insert on public.stage_comments
  for each row execute function public.stage_comment_log();

revoke all on function public.stage_block_stamp() from public, anon, authenticated;
revoke all on function public.stage_block_log() from public, anon, authenticated;
revoke all on function public.stage_comment_log() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Templates, and asking for one
-- ---------------------------------------------------------------------------

create table if not exists public.stage_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 60),
  width integer not null default 1200,
  height integer not null default 700,
  -- [{label, color, x, y, w, h, rotation}] — never a person: who stands
  -- where is this Sunday's, not the shape's.
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stage_template_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  width integer not null default 1200,
  height integer not null default 700,
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  requested_by uuid references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);

alter table public.stage_templates enable row level security;
alter table public.stage_template_requests enable row level security;
revoke all on public.stage_templates, public.stage_template_requests from anon;
-- Both are written only through the functions below.
revoke insert, update, delete, truncate on public.stage_templates, public.stage_template_requests from authenticated;

create policy stage_templates_select on public.stage_templates
  for select using ((select auth.uid()) is not null);
-- Your own asks, and every ask for whoever answers them.
create policy stage_template_requests_select on public.stage_template_requests
  for select using (requested_by = auth.uid() or public.is_admin(auth.uid()));

/** The shape of a layout, ready to keep: blocks without their people. */
create or replace function public.stage_layout_shape(lay uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', b.label, 'color', b.color, 'x', b.x, 'y', b.y, 'w', b.w, 'h', b.h, 'rotation', b.rotation
  ) order by b.z, b.placed_at), '[]'::jsonb)
  from public.stage_blocks b where b.layout_id = lay;
$$;

revoke all on function public.stage_layout_shape(uuid) from public, anon, authenticated;

/*
 * Keep this session's layout as a template. Straight into the library
 * for somebody with the templates privilege; as an ask for an Admin
 * otherwise. Says which it did.
 */
create or replace function public.save_stage_template(p_session uuid, p_name text)
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
  select * into lay from public.stage_layouts where session_id = p_session;
  if not found then
    raise exception 'There is no layout for that session yet.' using errcode = '22023';
  end if;
  if not public.can_open_page(auth.uid(), 'stage') then
    raise exception 'You cannot open stage layouts.' using errcode = '42501';
  end if;

  if public.stage_may(auth.uid(), 'templates') then
    insert into public.stage_templates (name, width, height, blocks, created_by)
    values (v_name, lay.width, lay.height, public.stage_layout_shape(lay.id), auth.uid())
    on conflict (name) do update
      set width = excluded.width, height = excluded.height, blocks = excluded.blocks,
          updated_at = now();
    return 'saved';
  end if;

  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'Only somebody who can edit the layout can ask to keep it.' using errcode = '42501';
  end if;
  insert into public.stage_template_requests (name, width, height, blocks, requested_by)
  values (v_name, lay.width, lay.height, public.stage_layout_shape(lay.id), auth.uid())
  returning id into req;

  -- Whoever can answer hears about it: every Admin, the Owner among them.
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

/** An Admin's answer to an ask. Yes puts it in the library under its name. */
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
    -- A name already taken gets a number rather than overwriting somebody's.
    if exists (select 1 from public.stage_templates t where t.name = final_name) then
      final_name := left(r.name, 54) || ' (' || to_char(now(), 'DD Mon') || ')';
    end if;
    insert into public.stage_templates (name, width, height, blocks, created_by)
    values (final_name, r.width, r.height, r.blocks, r.requested_by)
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

revoke all on function public.decide_stage_template_request(uuid, boolean) from public, anon;
grant execute on function public.decide_stage_template_request(uuid, boolean) to authenticated;

/** Rename or delete a template: the templates privilege. */
create or replace function public.rename_stage_template(p_template uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.stage_may(auth.uid(), 'templates') then
    raise exception 'You cannot change the template library.' using errcode = '42501';
  end if;
  update public.stage_templates set name = btrim(p_name), updated_at = now() where id = p_template;
end;
$$;

create or replace function public.delete_stage_template(p_template uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.stage_may(auth.uid(), 'templates') then
    raise exception 'You cannot change the template library.' using errcode = '42501';
  end if;
  delete from public.stage_templates where id = p_template;
end;
$$;

revoke all on function public.rename_stage_template(uuid, text) from public, anon;
grant execute on function public.rename_stage_template(uuid, text) to authenticated;
revoke all on function public.delete_stage_template(uuid) from public, anon;
grant execute on function public.delete_stage_template(uuid) to authenticated;

/*
 * Put a template on a session's stage, replacing what is there. Needs
 * edit (to change the layout) and, if anything is on it already, delete.
 * One line in the log, not one per block.
 */
create or replace function public.apply_stage_template(p_session uuid, p_template uuid)
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

  select id into lay from public.stage_layouts where session_id = p_session;
  if lay is null then
    insert into public.stage_layouts (session_id, service_id, width, height, created_by)
    values (p_session, svc, t.width, t.height, auth.uid())
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
    insert into public.stage_blocks (layout_id, label, color, x, y, w, h, rotation, z)
    values (lay, left(b ->> 'label', 40), coalesce(b ->> 'color', '#0A84FF'),
            greatest(0, (b ->> 'x')::numeric), greatest(0, (b ->> 'y')::numeric),
            least(4000, greatest(40, (b ->> 'w')::numeric)), least(4000, greatest(40, (b ->> 'h')::numeric)),
            coalesce((b ->> 'rotation')::smallint, 0), i);
  end loop;
  perform set_config('rim.stage_quiet', 'off', true);

  insert into public.stage_layout_log (layout_id, kind, detail, by)
  values (lay, 'template_applied', jsonb_build_object('name', t.name, 'blocks', i, 'replaced', replaced), auth.uid());
  return lay;
end;
$$;

revoke all on function public.apply_stage_template(uuid, uuid) from public, anon;
grant execute on function public.apply_stage_template(uuid, uuid) to authenticated;

/*
 * Take everything off the stage. Logged once; a block deleted this way
 * is not a line of its own.
 */
create or replace function public.clear_stage_layout(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lay public.stage_layouts%rowtype;
  n integer;
begin
  select * into lay from public.stage_layouts where session_id = p_session;
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

-- ---------------------------------------------------------------------------
-- The clear day
-- ---------------------------------------------------------------------------

/*
 * Hourly. On the church's day, at the church's hour, in the church's own
 * time: every layout for a service already held goes, with its comments
 * and its log. Templates stay.
 */
create or replace function public.clear_stage_layouts_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings%rowtype;
  local_now timestamp;
begin
  select * into s from public.app_settings limit 1;
  if not found or s.stage_clear_dow is null then
    return;
  end if;
  local_now := now() at time zone public.church_timezone();
  if extract(dow from local_now)::int = s.stage_clear_dow
     and extract(hour from local_now)::int = s.stage_clear_hour then
    delete from public.stage_layouts l
    using public.services sv
    where sv.id = l.service_id and sv.date < local_now::date;
  end if;
end;
$$;

revoke all on function public.clear_stage_layouts_if_due() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'clear-stage-layouts';
    perform cron.schedule('clear-stage-layouts', '10 * * * *', 'select public.clear_stage_layouts_if_due();');
  end if;
end $cron$;

-- ---------------------------------------------------------------------------
-- Live
-- ---------------------------------------------------------------------------

do $pub$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['stage_layouts', 'stage_blocks', 'stage_comments', 'stage_layout_log', 'stage_templates', 'stage_template_requests', 'stage_team_access'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $pub$;

notify pgrst, 'reload schema';

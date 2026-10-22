-- What the security audit found about the bell and the phone, and the doors
-- it closes.
--
-- Every notification row becomes a push to a phone (push-notify) and a line
-- in the bell. Five things let a member decide what lands there, for whom,
-- and how often:
--
--   * keep_newest_notifications (0128) kept each person's newest ten rows
--     whether read or not, so ten ordinary board posts — which notify
--     everybody — erased every unread prompt in the church, and any
--     repeatable ask (join a team, move a stage block, keep a template) did
--     the same to the people it reached. A prompt nobody has read is not
--     old news: the trim keeps unread rows, and the board notice, the one
--     kind that arrives by the dozen, is one per person.
--   * the board post notified every profile, readers of the board or not.
--   * a mention put the whole post, of any length, on the phone of any
--     uuid the author typed, reader of the board or not, with no limit on
--     how many. A mention names a reader and says a line.
--   * a family-link request put the requester's own profile name — free
--     text — on the other person's lock screen. The phone gets a sentence
--     nobody wrote; the request row says who asked.
--   * asking to join a team could be withdrawn and re-asked without pause,
--     and asking to move a block or keep a template told every Admin again
--     each time. Asking again waits a day; an ask already open is not
--     announced twice.
--
-- A name is a name: profiles.first_name and last_name are bounded and
-- carry no control characters, and handle_new_user keeps a signup within
-- that, so no body built from a name can carry a message.

-- ---------------------------------------------------------------------------
-- A prompt nobody has read is not old news
-- ---------------------------------------------------------------------------

create or replace function public.keep_newest_notifications(p_users uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep integer := coalesce((select notification_keep_count from public.app_settings limit 1), 10);
begin
  -- Read rows past the newest N go; unread ones stay until they are read.
  delete from public.notifications n
  using (
    select id from (
      select id, read_boolean,
             row_number() over (partition by user_id order by created_at desc, id desc) as place
      from public.notifications
      where p_users is null or user_id = any (p_users)
    ) ranked
    where place > keep and read_boolean
  ) extra
  where n.id = extra.id;

  -- The board notice is the one kind that arrives by the dozen: one each.
  delete from public.notifications n
  using (
    select id from (
      select id, row_number() over (partition by user_id order by created_at desc, id desc) as place
      from public.notifications
      where type = 'message' and (p_users is null or user_id = any (p_users))
    ) ranked
    where place > 1
  ) extra
  where n.id = extra.id;
end;
$$;

-- The board tells its readers, and never a second unread time.
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, reference_id)
  select p.id, 'message', new.id
  from public.profiles p
  where p.id <> new.author_id
    and public.can_open_page(p.id, 'messages')
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id and n.type = 'message' and n.read_boolean = false
    );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A mention names a reader and says a line
-- ---------------------------------------------------------------------------

alter table public.messages
  drop constraint if exists messages_body_is_a_post,
  add constraint messages_body_is_a_post check (length(body) between 1 and 4000) not valid,
  drop constraint if exists messages_mentions_are_few,
  add constraint messages_mentions_are_few check (coalesce(array_length(mentions, 1), 0) <= 20) not valid;

create or replace function public.notify_mentions_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if array_length(new.mentions, 1) is null then
    return new;
  end if;

  perform public.notify_people(
    array(
      select distinct m from unnest(new.mentions) as m
      where m <> new.author_id
        and public.can_open_page(m, 'messages')
    ),
    'mention',
    new.id,
    left(btrim(new.body), 140)
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A request carries no message
-- ---------------------------------------------------------------------------

create or replace function public.request_family_link(p_to uuid, p_relation text, p_replaces uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  req uuid;
  hh uuid;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if p_to is null or p_to = me then
    raise exception 'Choose somebody else.';
  end if;
  if not exists (select 1 from public.profiles where id = p_to) then
    raise exception 'That account no longer exists.';
  end if;
  if p_relation not in ('spouse', 'child', 'parent') then
    raise exception 'Unknown relation.';
  end if;
  if p_replaces is not null then
    select household_id into hh from public.household_members where id = p_replaces and user_id is null;
    if hh is null or not public.in_household(me, hh) then
      raise exception 'That entry is not one you can replace.';
    end if;
  end if;

  -- Already one family in the way asked: nothing to ask.
  if (p_relation = 'spouse' and public.home_of(me) is not null and public.home_of(me) = public.home_of(p_to))
     or (p_relation = 'child' and public.home_of(me) is not null and public.home_of(me) = public.parents_home_of(p_to))
     or (p_relation = 'parent' and public.parents_home_of(me) is not null and public.parents_home_of(me) = public.home_of(p_to)) then
    raise exception 'You are already linked.';
  end if;

  insert into public.family_link_requests (from_user, to_user, relation, replaces_member)
  values (me, p_to, p_relation, p_replaces)
  on conflict (from_user, to_user, relation) do update set replaces_member = excluded.replaces_member
  returning id into req;

  -- The request row carries who asked; the phone gets a sentence nobody wrote.
  perform public.notify_people(
    array[p_to],
    'family_link_request',
    req,
    format('Somebody has added you as their %s. Open the app to see who and say if that is right.', p_relation)
  );
  return req;
end;
$function$;

create or replace function public.answer_family_link(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  r public.family_link_requests;
  dst uuid;
  src uuid;
begin
  select * into r from public.family_link_requests where id = p_request and to_user = me for update;
  if r.id is null then
    raise exception 'That request is no longer waiting on you.';
  end if;

  if not p_accept then
    delete from public.family_link_requests where id = r.id;
    perform public.notify_people(
      array[r.from_user], 'family_link_answered', r.id,
      format('The person you added as your %s did not confirm it.', r.relation)
    );
    return;
  end if;

  if r.relation = 'spouse' then
    dst := public.ensure_home(r.from_user);
    delete from public.household_members where id = r.replaces_member and household_id = dst and user_id is null;
    src := public.home_of(me);
    perform public.merge_households(src, dst, true);
    if not exists (select 1 from public.household_members where household_id = dst and user_id = me) then
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'adult', me, r.from_user);
    end if;
  elsif r.relation = 'child' then
    dst := public.ensure_home(r.from_user);
    if public.home_of(me) = dst then
      raise exception 'You are already an adult in that household.';
    end if;
    delete from public.household_members where id = r.replaces_member and household_id = dst and user_id is null;
    src := public.parents_home_of(me);
    perform public.merge_households(src, dst, false);
    if not exists (select 1 from public.household_members where household_id = dst and user_id = me) then
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'child', me, r.from_user);
    end if;
  else
    -- They asked you to be their parent: they join your home as a child.
    dst := public.ensure_home(me);
    src := public.parents_home_of(r.from_user);
    if src is not null then
      delete from public.household_members where id = r.replaces_member and household_id = src and user_id is null;
    end if;
    perform public.merge_households(src, dst, false);
    if not exists (select 1 from public.household_members where household_id = dst and user_id = r.from_user) then
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'child', r.from_user, me);
    end if;
  end if;

  delete from public.family_link_requests where id = r.id;
  perform public.notify_people(
    array[r.from_user], 'family_link_answered', r.id,
    format('The person you added as your %s confirmed it. You are linked.', r.relation)
  );
end;
$function$;

-- A name is a name.
alter table public.profiles
  drop constraint if exists profiles_first_name_is_a_name,
  add constraint profiles_first_name_is_a_name
    check (length(first_name) <= 80 and first_name !~ '[[:cntrl:]]') not valid,
  drop constraint if exists profiles_last_name_is_a_name,
  add constraint profiles_last_name_is_a_name
    check (length(last_name) <= 80 and last_name !~ '[[:cntrl:]]') not valid;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'first_name', ''), '[[:cntrl:]]', '', 'g'), 80),
    left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'last_name', ''), '[[:cntrl:]]', '', 'g'), 80),
    new.email
  );
  insert into public.profile_sensitive (user_id) values (new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Asking again waits a day; an open ask is not announced twice
-- ---------------------------------------------------------------------------

create or replace function public.request_team_join(dept_id uuid, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not exists (select 1 from public.departments where id = dept_id) then
    raise exception 'That team no longer exists';
  end if;
  if exists (
    select 1 from public.department_members
    where user_id = auth.uid() and department_id = dept_id
  ) then
    raise exception 'You are already on that team';
  end if;
  if exists (
    select 1 from public.team_join_requests
    where user_id = auth.uid() and department_id = dept_id and status = 'pending'
  ) then
    raise exception 'You have already asked to join that team — the head has it';
  end if;
  if exists (
    select 1 from public.team_join_requests
    where user_id = auth.uid() and department_id = dept_id
      and status in ('withdrawn', 'declined')
      and coalesce(responded_at, created_at) > now() - interval '1 day'
  ) then
    raise exception 'You asked to join that team today — ask again tomorrow';
  end if;

  insert into public.team_join_requests (user_id, department_id, note)
  values (auth.uid(), dept_id, note)
  returning id into new_id;

  -- Whoever can answer it, which is the whole point.
  insert into public.notifications (user_id, type, reference_id)
  select distinct ur.user_id, 'team_join_requested', new_id
  from public.user_roles ur
  where ur.user_id <> auth.uid()
    and (
      (ur.department_id = dept_id and ur.role_type in ('department_head', 'assisting_head'))
      or ur.role_type = 'admin'
    );

  return new_id;
end;
$$;

create or replace function public.request_stage_move(
  p_block uuid, p_x numeric, p_y numeric, p_w numeric, p_h numeric, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.stage_blocks%rowtype;
  req uuid;
  already_asked boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into b from public.stage_blocks where id = p_block;
  if not found then
    raise exception 'That block is gone.' using errcode = '22023';
  end if;
  if b.locked_at is null then
    raise exception 'That block is not locked; move it.' using errcode = '22023';
  end if;
  if public.service_has_finished(public.stage_layout_service(b.layout_id)) then
    raise exception 'That service has finished.' using errcode = '42501';
  end if;
  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'Only somebody who may edit the layout can ask to move a block.' using errcode = '42501';
  end if;
  -- One open ask per person per block; a second replaces it, quietly.
  delete from public.stage_move_requests
  where block_id = p_block and requested_by = auth.uid() and status = 'pending';
  get diagnostics already_asked = row_count;

  insert into public.stage_move_requests (block_id, layout_id, x, y, w, h, note, requested_by)
  values (p_block, b.layout_id, greatest(0, p_x), greatest(0, p_y),
          least(4000, greatest(40, p_w)), least(4000, greatest(40, p_h)),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into req;

  insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
  values (b.layout_id, b.id, b.label, 'move_requested',
          jsonb_build_object('to', jsonb_build_array(p_x, p_y), 'note', nullif(btrim(coalesce(p_note, '')), '')), auth.uid());

  if not already_asked then
    insert into public.notifications (user_id, type, reference_id)
    select distinct u.user_id, 'stage_move_request', req
    from (
      select r.user_id from public.user_roles r where r.role_type = 'admin'
      union select o.user_id from public.app_owner o
    ) u
    where u.user_id <> auth.uid();
  end if;
  return req;
end;
$$;

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
  already_asked boolean;
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
  -- One open ask per person per name; a second replaces it, quietly.
  delete from public.stage_template_requests
  where requested_by = auth.uid() and status = 'pending' and lower(name) = lower(v_name);
  get diagnostics already_asked = row_count;

  insert into public.stage_template_requests (name, blocks, requested_by)
  values (v_name, public.stage_layout_shape(lay.id), auth.uid())
  returning id into req;

  if not already_asked then
    insert into public.notifications (user_id, type, reference_id)
    select distinct u.user_id, 'stage_template_request', req
    from (
      select r.user_id from public.user_roles r where r.role_type = 'admin'
      union select o.user_id from public.app_owner o
    ) u
    where u.user_id <> auth.uid();
  end if;
  return 'requested';
end;
$$;

notify pgrst, 'reload schema';

/*
 * A role can have permanent people.
 *
 * The Owner asked (November 2026): "In TEAMS, have an option to add a role
 * and for that role, add an option to choose a permanent person(s). This
 * way, in the rota, that role appears by default with that person's name
 * instead of having to manually always choose role and the person every
 * time."
 *
 * A team's roles were already kept on its page (0016). What was missing is
 * the standing answer to "who does it": the same person runs the sound
 * desk every Sunday, and the Head was choosing the role and then the
 * person again for every service there is.
 *
 * A permanent person is a row: this person, this role, at every service or
 * at one kind of service (the church holds an English and a Malayalam
 * service each Sunday, and they are mostly different people).
 *
 * The rota is not taught a second way of being read. A permanent person is
 * put on it as an ordinary assignment — a real row in rota_assignments —
 * so the checklists, the call times, clock-in, "my rota" and every list
 * that asks who is serving see them like anybody else. They are put on:
 *
 *   when a service is made   by the planner or by a repeating series
 *                            (a trigger on services), and
 *   when they are made       on every service still to come that is the
 *   permanent                right kind.
 *
 * Never on a service where they have said they cannot serve; never over a
 * role they already hold there (one role a service, 0052); never on a
 * service that has finished or a day that has passed.
 *
 * It is a default, and a default gives way. Taking a permanent person off
 * one Sunday's rota is taking them off that Sunday: nothing puts them
 * back. Saying "can't make it" takes them off as it always has (0165).
 * Ending the arrangement takes them off the services still to come that it
 * put them on, and leaves the past as it was.
 *
 * Who may: whoever may arrange that team's rota (rota.assign), because it
 * is rota assignments that come of it. The Team Coordinator's role keeps
 * the rule it has for one service (0052): an Admin, the team's Head or its
 * Assisting Head.
 */

-- ---------------------------------------------------------------------------
-- The permanent people
-- ---------------------------------------------------------------------------

create table public.department_role_permanents (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.department_roles(id) on delete cascade,
  -- The role's team, written by set_role_permanent(): the foreign key below
  -- and the read policy both need it on the row.
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Null is every service; otherwise the kind of service, as services.service_type says it.
  service_type text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- One standing answer per person per role.
  constraint department_role_permanents_one_per_person unique (role_id, user_id),
  constraint department_role_permanents_service_type_said check (service_type is null or length(btrim(service_type)) between 1 and 120),
  -- Somebody on the team. Leaving the team ends it, with nothing to remember to do.
  constraint department_role_permanents_is_on_the_team
    foreign key (department_id, user_id) references public.department_members(department_id, user_id) on delete cascade
);

comment on table public.department_role_permanents is
  'Who holds a role as a matter of course (0282): put on the rota of every service to come, at every service or one kind. Written only by set_role_permanent() and remove_role_permanent().';

create index department_role_permanents_department_idx on public.department_role_permanents (department_id, user_id);
create index department_role_permanents_user_idx on public.department_role_permanents (user_id);
create index department_role_permanents_created_by_idx on public.department_role_permanents (created_by);

alter table public.department_role_permanents enable row level security;

-- Read by whoever reads the rota (0082): it is the rota, said ahead of time.
create policy department_role_permanents_select on public.department_role_permanents
  for select to authenticated
  using ((select public.is_on_a_team((select auth.uid()))) or (select public.can_open_page((select auth.uid()), 'rota')));

-- No write policy: the two functions below are the only way in, because
-- writing one writes rota assignments too.
revoke all on public.department_role_permanents from anon, authenticated;
grant select on public.department_role_permanents to authenticated;

create trigger department_role_permanents_live after insert or update or delete on public.department_role_permanents
  for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- The rota knows which rows came of it
-- ---------------------------------------------------------------------------

alter table public.rota_assignments
  add column permanent_id uuid references public.department_role_permanents(id) on delete set null;

comment on column public.rota_assignments.permanent_id is
  'The standing arrangement that put this person on (0282), if one did. Null for an assignment made by hand, and for a past one whose arrangement has since ended.';

create index rota_assignments_permanent_id_idx on public.rota_assignments (permanent_id);

/*
 * The Coordinator's guard (0052), as production has it by
 * pg_get_functiondef, with one way past: a permanent Coordinator was
 * named by somebody who may name one (set_role_permanent checks, with
 * this function's own rule), and is put on a new service by whoever made
 * the service — the planner, who need not be that team's Head.
 */
create or replace function public.rota_coordinator_label_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    return new; -- a cascade, a job, a migration
  end if;
  -- A standing arrangement being carried out: decided when it was made (0282).
  if coalesce(current_setting('rim.rota_permanent', true), '') = 'on' then
    return new;
  end if;
  if lower(btrim(new.role_label)) in ('coordinator', 'team coordinator')
     and (tg_op = 'INSERT'
          or lower(btrim(old.role_label)) not in ('coordinator', 'team coordinator')
          or new.user_id is distinct from old.user_id
          or new.department_id is distinct from old.department_id
          or new.service_id is distinct from old.service_id)
     and not (
       public.is_admin(auth.uid())
       or public.is_dept_head_or_assisting(auth.uid(), new.department_id)
       or (new.user_id is distinct from auth.uid()
           and public.may(auth.uid(), 'day.verify', new.department_id, new.service_id)
           and public.may(auth.uid(), 'day.ready', new.department_id, new.service_id))
     ) then
    raise exception 'Only an Admin, the team''s Head or Assisting Head, or somebody who already verifies for the team can name its Coordinator.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

/*
 * The feed (0165), as production has it by pg_get_functiondef, with one
 * thing more said: an assignment that came of a standing arrangement says
 * so. A new service is made with a dozen people already on it, and "Joel
 * assigned" twelve times under the planner's name reads as the planner
 * having chosen them.
 */
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
      old.role_label,
      case
        -- Their own "can't make it" took them off: the answer, not a hand.
        when coalesce(current_setting('rim.rota_dropout', true), '') = 'on' and auth.uid() = old.user_id
          then 'came off, can''t serve'
        -- Somebody marked them unavailable for them.
        when coalesce(current_setting('rim.rota_dropout', true), '') = 'on'
          then coalesce(nullif(who, ''), 'someone') || ' off, marked can''t serve'
        else coalesce(nullif(who, ''), 'someone') || ' taken off'
      end
    );
    return old;
  end if;

  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into who from public.profiles where id = new.user_id;
  perform public.record_activity(
    new.service_id, new.department_id, auth.uid(), 'rota',
    new.role_label,
    coalesce(nullif(who, ''), 'someone') ||
      case when tg_op = 'INSERT' and new.permanent_id is not null then ' on, permanent in this role' else ' assigned' end
  );
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Putting them on
-- ---------------------------------------------------------------------------

/*
 * Put permanent people on the services still to come: all of them, one
 * service's (it was just made), or one arrangement's (it was just made or
 * changed). Answers how many assignments it made.
 *
 * The database's own: nobody calls it over the API.
 */
create or replace function public.rota_fill_permanents(only_service uuid default null, only_permanent uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone public.church_timezone())::date;
  made integer := 0;
  n integer;
  slot record;
begin
  perform set_config('rim.rota_permanent', 'on', true);
  for slot in
    select pm.id as permanent_id, pm.department_id, pm.user_id, r.id as role_id, r.name as role_name, s.id as service_id
      from public.department_role_permanents pm
      join public.department_roles r on r.id = pm.role_id
      join public.services s
        on pm.service_type is null
        or lower(btrim(s.service_type)) = lower(btrim(pm.service_type))
     where (only_service is null or s.id = only_service)
       and (only_permanent is null or pm.id = only_permanent)
       and s.date >= today
       and not public.service_has_finished(s.id)
       -- They have said they cannot serve there: not put on. The same
       -- answer that takes somebody off a rota they are already on (0165).
       and not exists (
         select 1 from public.availability a
          where a.service_id = s.id and a.department_id = pm.department_id
            and a.user_id = pm.user_id and a.status = 'unavailable'
       )
     -- The older arrangement first: where two of somebody's would meet at one
     -- service, the one that has stood longer is the one that holds.
     order by s.date, s.id, pm.created_at, pm.id
  loop
    -- Already holding a role at that service (0052's one role a service,
    -- or this very one): left as it is.
    insert into public.rota_assignments (service_id, department_id, user_id, role_label, role_id, permanent_id)
    values (slot.service_id, slot.department_id, slot.user_id, slot.role_name, slot.role_id, slot.permanent_id)
    on conflict do nothing;
    get diagnostics n = row_count;
    made := made + n;
  end loop;
  perform set_config('rim.rota_permanent', 'off', true);
  return made;
end;
$$;

revoke all on function public.rota_fill_permanents(uuid, uuid) from public, anon, authenticated;

-- A service is made — by hand in the planner, or by a repeating series
-- overnight — and the people who are always there are on it already.
create or replace function public.service_made_fills_permanents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rota_fill_permanents(new.id, null);
  return null;
end;
$$;

revoke all on function public.service_made_fills_permanents() from public, anon, authenticated;

create trigger services_fill_permanents
  after insert on public.services
  for each row execute function public.service_made_fills_permanents();

/*
 * The arrangement ends — it was removed, the role was deleted, the person
 * left the team — and the services still to come that it put them on lose
 * them. What has been is left alone: the foreign key empties permanent_id
 * and the row stays as the record of who served.
 */
create or replace function public.permanent_ended_frees_the_rota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone public.church_timezone())::date;
begin
  delete from public.rota_assignments a
   using public.services s
   where a.permanent_id = old.id
     and s.id = a.service_id
     and s.date >= today
     and not public.service_has_finished(s.id);
  return old;
end;
$$;

revoke all on function public.permanent_ended_frees_the_rota() from public, anon, authenticated;

create trigger department_role_permanents_ended
  before delete on public.department_role_permanents
  for each row execute function public.permanent_ended_frees_the_rota();

-- ---------------------------------------------------------------------------
-- The two ways in
-- ---------------------------------------------------------------------------

/*
 * Make somebody permanent on a role, or change which services they are
 * permanent at. Answers how many services still to come they were put on.
 */
create or replace function public.set_role_permanent(p_role uuid, p_person uuid, p_service_type text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  role public.department_roles%rowtype;
  kind text := nullif(btrim(coalesce(p_service_type, '')), '');
  existing public.department_role_permanents%rowtype;
  today date := (now() at time zone public.church_timezone())::date;
  row_id uuid;
begin
  select * into role from public.department_roles where id = p_role;
  if not found then
    raise exception 'That role is no longer here.';
  end if;
  if me is null or not public.may(me, 'rota.assign', role.department_id) then
    raise exception 'Choosing who is permanently on a role is for whoever arranges this team''s rota.'
      using errcode = '42501';
  end if;
  -- The Coordinator verifies the team's checklist: naming one is the
  -- Head's, here as on a single service.
  if lower(btrim(role.name)) in ('coordinator', 'team coordinator')
     and not (public.is_admin(me) or public.is_dept_head_or_assisting(me, role.department_id)) then
    raise exception 'Only an Admin, the team''s Head or Assisting Head can name its permanent Coordinator.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.department_members m where m.department_id = role.department_id and m.user_id = p_person
  ) then
    raise exception 'They are not on this team. Add them to the team first.';
  end if;

  select * into existing from public.department_role_permanents where role_id = p_role and user_id = p_person;
  if found then
    row_id := existing.id;
    if existing.service_type is not distinct from kind then
      -- Nothing to change; anything missing (a service they have since
      -- become free for is not one of them) is not put back by asking twice.
      return 0;
    end if;
    update public.department_role_permanents set service_type = kind where id = row_id;
    -- The services still to come that it put them on and no longer covers.
    if kind is not null then
      delete from public.rota_assignments a
       using public.services s
       where a.permanent_id = row_id
         and s.id = a.service_id
         and s.date >= today
         and not public.service_has_finished(s.id)
         and lower(btrim(s.service_type)) <> lower(kind);
    end if;
  else
    insert into public.department_role_permanents (role_id, department_id, user_id, service_type, created_by)
    values (p_role, role.department_id, p_person, kind, me)
    returning id into row_id;
  end if;

  return public.rota_fill_permanents(null, row_id);
end;
$$;

/*
 * End it. Answers how many services still to come they were taken off.
 * Ending what is not there does nothing.
 */
create or replace function public.remove_role_permanent(p_role uuid, p_person uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing public.department_role_permanents%rowtype;
  today date := (now() at time zone public.church_timezone())::date;
  freed integer;
begin
  select * into existing from public.department_role_permanents where role_id = p_role and user_id = p_person;
  if not found then
    return 0;
  end if;
  if me is null or not public.may(me, 'rota.assign', existing.department_id) then
    raise exception 'Choosing who is permanently on a role is for whoever arranges this team''s rota.'
      using errcode = '42501';
  end if;
  select count(*) into freed
    from public.rota_assignments a
    join public.services s on s.id = a.service_id
   where a.permanent_id = existing.id and s.date >= today and not public.service_has_finished(s.id);
  delete from public.department_role_permanents where id = existing.id;
  return freed;
end;
$$;

revoke all on function public.set_role_permanent(uuid, uuid, text) from public, anon;
grant execute on function public.set_role_permanent(uuid, uuid, text) to authenticated;
revoke all on function public.remove_role_permanent(uuid, uuid) from public, anon;
grant execute on function public.remove_role_permanent(uuid, uuid) to authenticated;

/*
 * A team can list somebody with no account.
 *
 * Adding somebody to a team stopped at "No registered user matches that":
 * the person who helps with sound every other week but has never signed
 * up could not be put on the team at all, so they were not on the rota
 * either. The church already keeps such people once, on the guest roll
 * (0091), and a session can already name a guest (0093). What was missing
 * was the team.
 *
 * So a team has a second list, `department_guests`: the roll's people who
 * are on it, core or guest, the same way an account holder is. It is its
 * own table rather than a null `user_id` on `department_members`, because
 * everything that counts a team — availability, reminders, readiness,
 * turnout, who may see what — counts account holders, and a null there
 * would have to be remembered in every one of those places. A guest on
 * a team is on the rota and on the page; they are not asked whether they
 * can serve, since there is nobody to ask.
 *
 * When the guest signs up and is linked to their account (the roll's
 * `became_member`), their team rows come across as memberships, and the
 * guest rows go: the team has the same people, and now they have a login.
 */

create table if not exists public.department_guests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  member_type public.member_type not null default 'core',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (department_id, guest_id)
);

comment on table public.department_guests is
  'The guest roll''s people on a team, core or guest, until they have an account (then department_members).';

alter table public.department_guests enable row level security;

drop policy if exists department_guests_select on public.department_guests;
create policy department_guests_select on public.department_guests
  for select using (public.can_view_department_content(auth.uid(), department_id));

drop policy if exists department_guests_write on public.department_guests;
create policy department_guests_write on public.department_guests
  for all using (public.may(auth.uid(), 'team.members', department_id))
  with check (public.may(auth.uid(), 'team.members', department_id));

/*
 * Put a name on the team. The roll is the Admin's to write (0091), but
 * whoever may manage a team's members may put a helper on it, so this
 * runs as the definer: it finds the name on the roll (case and spacing
 * ignored, somebody who has since joined not counted) or adds it, then
 * lists them on the team. Returns the guest's id.
 */
create or replace function public.add_guest_to_team(p_department uuid, p_name text, p_type public.member_type default 'core')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  g uuid;
begin
  if not public.may(auth.uid(), 'team.members', p_department) then
    raise exception 'You cannot change who is on this team.' using errcode = '42501';
  end if;
  if length(nm) = 0 then
    raise exception 'A name is needed.' using errcode = '22023';
  end if;
  if nm like '%@%' then
    raise exception 'That looks like an email address; a guest is added by name.' using errcode = '22023';
  end if;
  select id into g from public.guests
  where lower(btrim(name)) = lower(nm) and became_member is null
  order by created_at limit 1;
  if g is null then
    insert into public.guests (name, created_by) values (nm, auth.uid()) returning id into g;
  end if;
  if exists (select 1 from public.department_guests where department_id = p_department and guest_id = g) then
    raise exception '% is already on this team.', nm using errcode = '23505';
  end if;
  insert into public.department_guests (department_id, guest_id, member_type, created_by)
  values (p_department, g, coalesce(p_type, 'core'), auth.uid());
  return g;
end;
$$;

revoke all on function public.add_guest_to_team(uuid, text, public.member_type) from public, anon;
grant execute on function public.add_guest_to_team(uuid, text, public.member_type) to authenticated;

/*
 * The day they sign up. Linking a guest to an account (became_member set)
 * moves their team rows across as memberships, keeping core or guest, and
 * drops the guest rows; a team they were already on by account keeps the
 * membership it had. Runs as the definer, since the Admin linking them
 * need not be allowed to write every team.
 */
create or replace function public.guest_joined_moves_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.became_member is null and new.became_member is not null then
    insert into public.department_members (department_id, user_id, member_type)
    select dg.department_id, new.became_member, dg.member_type
    from public.department_guests dg
    where dg.guest_id = new.id
    on conflict (department_id, user_id) do nothing;
    delete from public.department_guests where guest_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists guest_joined_moves_teams on public.guests;
create trigger guest_joined_moves_teams
  after update of became_member on public.guests
  for each row execute function public.guest_joined_moves_teams();

notify pgrst, 'reload schema';

/*
 * A family is a household.
 *
 * The profile knew a person and nothing about who they live with. A
 * church thinks in families: who the children are and how old, whose
 * spouse is whose, where a family lives. Until now that lived in
 * somebody's head or a spreadsheet, and the volunteer export could not
 * say any of it.
 *
 * **One household, one address.** A household holds the address and the
 * people in it: up to two adults, and any number of children. A married
 * couple share one, so either of them can change the address and both
 * see it, and a child either of them adds is the other's child too —
 * there is one list, not two to keep in step.
 *
 * **A person is either an account or a name.** Somebody with an account
 * is linked by their id, and their name and date of birth come from their
 * profile, so they are never typed twice. Somebody without one (most
 * children, a spouse not on the app) is written in by hand: name, date of
 * birth, and for a child gender, school and year group.
 *
 * **Linking an account needs the other person's yes.** Choosing an account
 * as your spouse, child or parent sends them a request (a notification,
 * and a card on their dashboard); nothing is linked or shared until they
 * accept. A request can name a hand-written entry it replaces, so a
 * spouse who joins the app later takes the place of the details typed in
 * for them. When two households become one — a couple who had each set
 * up their own, a child whose parents' details they had written in — the
 * two are merged into the requester's.
 *
 * **Seen by the family and the Owner, nobody else.** Everybody with an
 * account in a household sees it; the Owner sees every household, for
 * the export. Admins, Heads and the rest of the church see none of it,
 * the same rule as contact details (0126). Writing goes through the
 * functions below only: there are no insert, update or delete policies.
 *
 * **It goes with the people.** A household is deleted once nobody with
 * an account is left in it, taking the hand-written entries with it — an
 * account removed, or the Owner's erase, leaves no orphaned families.
 *
 * Every person belongs to at most one household as an adult (their own)
 * and at most one as a child (their parents').
 */

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  address_line1 text check (length(address_line1) <= 120),
  address_line2 text check (length(address_line2) <= 120),
  town text check (length(town) <= 80),
  postcode text check (length(postcode) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.households is
  'A family: its address and its people (household_members). Seen by its own members and the Owner.';

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('adult', 'child')),
  -- The account, when the person has one. Their name and date of birth are
  -- then their profile's, and the columns below stay empty.
  user_id uuid references public.profiles(id) on delete cascade,
  first_name text check (length(first_name) <= 60),
  last_name text check (length(last_name) <= 60),
  dob date,
  gender text check (gender in ('male', 'female')),
  school text check (length(school) <= 120),
  year_group text check (length(year_group) <= 40),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint household_members_is_somebody
    check (user_id is not null or nullif(btrim(coalesce(first_name, '')), '') is not null),
  unique (household_id, user_id)
);

comment on table public.household_members is
  'The people in a household: linked accounts (user_id) or hand-written entries.';

create unique index if not exists household_members_one_home
  on public.household_members (user_id) where kind = 'adult' and user_id is not null;
create unique index if not exists household_members_one_parents_home
  on public.household_members (user_id) where kind = 'child' and user_id is not null;
create index if not exists household_members_household_idx
  on public.household_members (household_id);

create table if not exists public.family_link_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  -- What to_user is to from_user.
  relation text not null check (relation in ('spouse', 'child', 'parent')),
  -- The hand-written entry this account takes the place of, if any.
  replaces_member uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint family_link_requests_not_yourself check (from_user <> to_user)
);

comment on table public.family_link_requests is
  'An account asked to be linked as somebody''s spouse, child or parent. Removed once answered.';

create unique index if not exists family_link_requests_one_at_a_time
  on public.family_link_requests (from_user, to_user, relation);
create index if not exists family_link_requests_to_idx
  on public.family_link_requests (to_user);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.family_link_requests enable row level security;

revoke insert, update, delete, truncate on public.households from anon, authenticated;
revoke insert, update, delete, truncate on public.household_members from anon, authenticated;
revoke insert, update, delete, truncate on public.family_link_requests from anon, authenticated;

/* Whether this account is one of the people in that household. */
create or replace function public.in_household(uid uuid, hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select uid is not null and exists (
    select 1 from public.household_members m where m.household_id = hh and m.user_id = uid
  );
$function$;

revoke all on function public.in_household(uuid, uuid) from public, anon;
grant execute on function public.in_household(uuid, uuid) to authenticated;

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select using (public.in_household(auth.uid(), id) or public.is_super_admin(auth.uid()));

drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select using (public.in_household(auth.uid(), household_id) or public.is_super_admin(auth.uid()));

drop policy if exists family_link_requests_select on public.family_link_requests;
create policy family_link_requests_select on public.family_link_requests
  for select using (
    from_user = auth.uid() or to_user = auth.uid() or public.is_super_admin(auth.uid())
  );

/* Two adults at most: a household is a couple and their children. */
create or replace function public.household_members_two_adults()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.kind = 'adult' and (
    select count(*) from public.household_members m
    where m.household_id = new.household_id and m.kind = 'adult' and m.id <> new.id
  ) >= 2 then
    raise exception 'That household already has two adults.';
  end if;
  return new;
end;
$function$;

drop trigger if exists household_members_two_adults on public.household_members;
create trigger household_members_two_adults
  before insert or update of household_id, kind on public.household_members
  for each row execute function public.household_members_two_adults();

/* A household nobody with an account is left in goes, with its entries. */
create or replace function public.household_goes_when_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(current_setting('rim.merging_households', true), '') = '1' then
    return null;
  end if;
  delete from public.households h
  where h.id = old.household_id
    and not exists (
      select 1 from public.household_members m
      where m.household_id = h.id and m.user_id is not null
    );
  return null;
end;
$function$;

drop trigger if exists household_goes_when_empty on public.household_members;
create trigger household_goes_when_empty
  after delete on public.household_members
  for each row execute function public.household_goes_when_empty();

/* The household this person heads (as an adult), or as a child. */
create or replace function public.home_of(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select household_id from public.household_members where user_id = uid and kind = 'adult';
$function$;

create or replace function public.parents_home_of(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select household_id from public.household_members where user_id = uid and kind = 'child';
$function$;

/* The same, made if there is none yet. */
create or replace function public.ensure_home(uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  hh uuid := public.home_of(uid);
begin
  if hh is null then
    insert into public.households default values returning id into hh;
    insert into public.household_members (household_id, kind, user_id, added_by)
    values (hh, 'adult', uid, uid);
  end if;
  return hh;
end;
$function$;

create or replace function public.ensure_parents_home(uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  hh uuid := public.parents_home_of(uid);
begin
  if hh is null then
    insert into public.households default values returning id into hh;
    insert into public.household_members (household_id, kind, user_id, added_by)
    values (hh, 'child', uid, uid);
  end if;
  return hh;
end;
$function$;

/*
 * Two households become one: everybody in `src` moves to `dst`, and `src`
 * goes. Somebody already in `dst` is not moved twice. Hand-written adults
 * move only while `dst` has room for them — or, when two spouses' homes
 * merge, not at all, since they were the couple's entries for each other.
 * The address is `dst`'s, unless it has none.
 */
create or replace function public.merge_households(src uuid, dst uuid, drop_written_adults boolean)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  m record;
begin
  if src is null or dst is null or src = dst then
    return;
  end if;
  perform set_config('rim.merging_households', '1', true);

  if drop_written_adults then
    delete from public.household_members where household_id = src and kind = 'adult' and user_id is null;
  end if;

  delete from public.household_members s
  where s.household_id = src and s.user_id is not null
    and exists (select 1 from public.household_members d where d.household_id = dst and d.user_id = s.user_id);

  for m in
    select id from public.household_members where household_id = src and kind = 'adult' and user_id is null
  loop
    if (select count(*) from public.household_members where household_id = dst and kind = 'adult') < 2 then
      update public.household_members set household_id = dst where id = m.id;
    else
      delete from public.household_members where id = m.id;
    end if;
  end loop;

  update public.household_members set household_id = dst where household_id = src;

  update public.households d
  set address_line1 = s.address_line1, address_line2 = s.address_line2,
      town = s.town, postcode = s.postcode, updated_at = now()
  from public.households s
  where d.id = dst and s.id = src
    and d.address_line1 is null and d.town is null and d.postcode is null;

  delete from public.households where id = src;
  perform set_config('rim.merging_households', '', true);
end;
$function$;

revoke all on function public.home_of(uuid) from public, anon, authenticated;
revoke all on function public.parents_home_of(uuid) from public, anon, authenticated;
revoke all on function public.ensure_home(uuid) from public, anon, authenticated;
revoke all on function public.ensure_parents_home(uuid) from public, anon, authenticated;
revoke all on function public.merge_households(uuid, uuid, boolean) from public, anon, authenticated;

/* The household's address, for whoever lives there. */
create or replace function public.save_household_address(
  p_line1 text, p_line2 text, p_town text, p_postcode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  hh uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  hh := public.ensure_home(auth.uid());
  update public.households
  set address_line1 = nullif(btrim(p_line1), ''),
      address_line2 = nullif(btrim(p_line2), ''),
      town = nullif(btrim(p_town), ''),
      postcode = nullif(upper(btrim(p_postcode)), ''),
      updated_at = now()
  where id = hh;
  return hh;
end;
$function$;

/*
 * Add or change a hand-written person: a spouse or child in your home
 * (`home`), or a parent in your parents' (`parents`). A linked account's
 * details are theirs to change on their own profile, not here.
 */
create or replace function public.save_household_person(
  p_id uuid,
  p_where text,
  p_kind text,
  p_first text,
  p_last text,
  p_dob date,
  p_gender text default null,
  p_school text default null,
  p_year text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  hh uuid;
  row_id uuid := p_id;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if nullif(btrim(coalesce(p_first, '')), '') is null then
    raise exception 'A first name is needed.';
  end if;
  if p_kind not in ('adult', 'child') then
    raise exception 'Unknown kind of person.';
  end if;

  if row_id is not null then
    select household_id into hh from public.household_members
    where id = row_id and user_id is null;
    if hh is null or not public.in_household(me, hh) then
      raise exception 'That person is not one you can change.';
    end if;
    update public.household_members
    set first_name = btrim(p_first), last_name = nullif(btrim(p_last), ''), dob = p_dob,
        gender = case when p_kind = 'child' then p_gender end,
        school = case when p_kind = 'child' then nullif(btrim(p_school), '') end,
        year_group = case when p_kind = 'child' then nullif(btrim(p_year), '') end
    where id = row_id;
    return row_id;
  end if;

  if p_where = 'parents' then
    if p_kind <> 'adult' then
      raise exception 'A parent is an adult.';
    end if;
    hh := public.ensure_parents_home(me);
  else
    hh := public.ensure_home(me);
  end if;

  insert into public.household_members (
    household_id, kind, first_name, last_name, dob, gender, school, year_group, added_by
  ) values (
    hh, p_kind, btrim(p_first), nullif(btrim(p_last), ''), p_dob,
    case when p_kind = 'child' then p_gender end,
    case when p_kind = 'child' then nullif(btrim(p_school), '') end,
    case when p_kind = 'child' then nullif(btrim(p_year), '') end,
    me
  ) returning id into row_id;
  return row_id;
end;
$function$;

/* Take somebody out of a household you are in — or yourself out of it. */
create or replace function public.remove_household_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  hh uuid;
begin
  select household_id into hh from public.household_members where id = p_id;
  if hh is null or not public.in_household(auth.uid(), hh) then
    raise exception 'That person is not one you can remove.';
  end if;
  delete from public.household_members where id = p_id;
end;
$function$;

/*
 * Ask an account to be linked as your spouse, child or parent. They are
 * told, and nothing changes until they say yes.
 */
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
  who text;
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

  select btrim(first_name || ' ' || last_name) into who from public.profiles where id = me;
  perform public.notify_people(
    array[p_to],
    'family_link_request',
    req,
    format('%s has added you as their %s. Is that right?', coalesce(who, 'Somebody'), p_relation)
  );
  return req;
end;
$function$;

/* Take back a request nobody has answered. */
create or replace function public.cancel_family_link(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  delete from public.family_link_requests where id = p_request and from_user = auth.uid();
end;
$function$;

/* Yes or no to a request made of you. */
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
  who text;
begin
  select * into r from public.family_link_requests where id = p_request and to_user = me for update;
  if r.id is null then
    raise exception 'That request is no longer waiting on you.';
  end if;
  select btrim(first_name || ' ' || last_name) into who from public.profiles where id = me;

  if not p_accept then
    delete from public.family_link_requests where id = r.id;
    perform public.notify_people(
      array[r.from_user], 'family_link_answered', r.id,
      format('%s did not confirm being your %s.', coalesce(who, 'Somebody'), r.relation)
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
    format('%s confirmed being your %s. You are linked.', coalesce(who, 'Somebody'), r.relation)
  );
end;
$function$;

revoke all on function public.save_household_address(text, text, text, text) from public, anon;
revoke all on function public.save_household_person(uuid, text, text, text, text, date, text, text, text) from public, anon;
revoke all on function public.remove_household_person(uuid) from public, anon;
revoke all on function public.request_family_link(uuid, text, uuid) from public, anon;
revoke all on function public.cancel_family_link(uuid) from public, anon;
revoke all on function public.answer_family_link(uuid, boolean) from public, anon;
grant execute on function public.save_household_address(text, text, text, text) to authenticated;
grant execute on function public.save_household_person(uuid, text, text, text, text, date, text, text, text) to authenticated;
grant execute on function public.remove_household_person(uuid) to authenticated;
grant execute on function public.request_family_link(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_family_link(uuid) to authenticated;
grant execute on function public.answer_family_link(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

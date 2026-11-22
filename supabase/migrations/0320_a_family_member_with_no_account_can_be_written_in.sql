/*
 * A family member with no account can be written in for them.
 *
 * 0319 let whoever holds `people.family` link two accounts as family. A
 * family is seldom all on the app: a husband who has not joined, children
 * too young to. The family could always write those people in by hand on
 * their own profile (0149); the person linking families for them could
 * not, so a family was linked as far as its accounts went and stopped.
 *
 * The Owner, November 2026: "For those who aren't in the app, give the
 * ability to add the details manually (until they come as a member in
 * future)".
 *
 * So the same right writes people in. `save_family_person()` adds or
 * changes a hand-written husband or wife, child or parent in one
 * person's household — the row the family's own profile writes
 * (`save_household_person`), with the same details: a name, a date of
 * birth, and for a child whether a boy or a girl, the school and the
 * year. `remove_family_person()` takes one off. Both tell the family, as
 * a link does.
 *
 * **Until they join.** Nothing more is needed for that: when the person
 * gets an account, linking it (0319) takes the hand-written entry's
 * place — a husband or wife always, a child or a parent of the same
 * first name — and if a name was written differently, the entry is there
 * to take off.
 *
 * **What this opens, said plainly.** To change or remove what is written,
 * the holder has to read it, so `family_of()` now hands back the people
 * written in by hand with their details, where 0319 gave a count. That is
 * a date of birth, and a child's school and year, of people in other
 * families, to whoever holds `people.family` — Admins, out of the box,
 * who already read every account's date of birth (0257). The address
 * stays the family's and `people.contacts'`: it is not here.
 *
 * It refuses what a household cannot hold, in words: a second husband or
 * wife (linked or written), a third parent.
 */

-- ---------------------------------------------------------------------------
-- Who is in one person's family, written in or linked
-- ---------------------------------------------------------------------------

create or replace function public.family_of(p_person uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  home uuid;
  parents uuid;
  people jsonb;
  written jsonb;
begin
  if auth.uid() is null or not public.may(auth.uid(), 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  home := public.home_of(p_person);
  parents := public.parents_home_of(p_person);

  select jsonb_build_object(
    'spouse', coalesce(jsonb_agg(who order by name) filter (where part = 'spouse'), '[]'::jsonb),
    'children', coalesce(jsonb_agg(who order by name) filter (where part = 'child'), '[]'::jsonb),
    'parents', coalesce(jsonb_agg(who order by name) filter (where part = 'parent'), '[]'::jsonb)
  )
  into people
  from (
    select
      case
        when m.household_id = home and m.kind = 'adult' then 'spouse'
        when m.household_id = home and m.kind = 'child' then 'child'
        else 'parent'
      end as part,
      jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name) as who,
      lower(p.first_name || ' ' || p.last_name) as name
    from public.household_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id <> p_person
      and (m.household_id = home or (m.household_id = parents and m.kind = 'adult'))
  ) linked;

  -- The people written in by hand (0320): whoever may write them in has to
  -- be able to read what is written, to change it or take it off.
  select jsonb_build_object(
    'spouse', coalesce(jsonb_agg(who order by name) filter (where part = 'spouse'), '[]'::jsonb),
    'children', coalesce(jsonb_agg(who order by name) filter (where part = 'child'), '[]'::jsonb),
    'parents', coalesce(jsonb_agg(who order by name) filter (where part = 'parent'), '[]'::jsonb)
  )
  into written
  from (
    select
      case
        when m.household_id = home and m.kind = 'adult' then 'spouse'
        when m.household_id = home and m.kind = 'child' then 'child'
        else 'parent'
      end as part,
      jsonb_build_object(
        'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'dob', m.dob,
        'gender', m.gender, 'school', m.school, 'year_group', m.year_group
      ) as who,
      lower(m.first_name || ' ' || coalesce(m.last_name, '')) as name
    from public.household_members m
    where m.user_id is null
      and (m.household_id = home or (m.household_id = parents and m.kind = 'adult'))
  ) by_hand;

  return people || jsonb_build_object(
    'written_people', written,
    -- The count 0319 gave, kept for an app that still reads it.
    'written', jsonb_build_object(
      'spouse', jsonb_array_length(written->'spouse'),
      'children', jsonb_array_length(written->'children'),
      'parents', jsonb_array_length(written->'parents')
    )
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- The sentence, wide enough for somebody written in
-- ---------------------------------------------------------------------------

create or replace function public.family_changed_tell(p_people uuid[], p_ref uuid)
returns void
language sql
security definer
set search_path = public
as $function$
  -- The profile says what; the phone gets a sentence nobody wrote (0170).
  select public.notify_people(
    p_people,
    'family_link_answered',
    p_ref,
    'A church Admin has updated your family in the app. Open your profile to see.'
  );
$function$;

revoke all on function public.family_changed_tell(uuid[], uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing somebody in, and changing what is written
-- ---------------------------------------------------------------------------

/*
 * `p_relation` is what the person written in is to `p_person`: their
 * `spouse`, their `child` or their `parent`. With `p_id`, the entry
 * already written is changed and `p_relation` is not read.
 */
create or replace function public.save_family_person(
  p_person uuid,
  p_relation text,
  p_id uuid,
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
  person_name text;
  hh uuid;
  was text;
  row_id uuid := p_id;
  told uuid[];
begin
  if me is null or not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  select first_name into person_name from public.profiles where id = p_person;
  if person_name is null then
    raise exception 'That account no longer exists.';
  end if;
  if nullif(btrim(coalesce(p_first, '')), '') is null then
    raise exception 'A first name is needed.';
  end if;
  if p_gender is not null and p_gender not in ('male', 'female') then
    raise exception 'Unknown gender.';
  end if;
  if p_dob is not null and p_dob > current_date then
    raise exception 'A date of birth cannot be in the future.';
  end if;

  perform pg_advisory_xact_lock(hashtext('rim.family_links'));

  if row_id is not null then
    select household_id, kind into hh, was from public.household_members where id = row_id and user_id is null;
    if hh is null or (hh is distinct from public.home_of(p_person) and hh is distinct from public.parents_home_of(p_person)) then
      raise exception 'That person is not one written in for this family.';
    end if;
    update public.household_members
    set first_name = btrim(p_first), last_name = nullif(btrim(p_last), ''), dob = p_dob,
        gender = case when was = 'child' then p_gender end,
        school = case when was = 'child' then nullif(btrim(p_school), '') end,
        year_group = case when was = 'child' then nullif(btrim(p_year), '') end
    where id = row_id;
  else
    if p_relation is null or p_relation not in ('spouse', 'child', 'parent') then
      raise exception 'Unknown relation.';
    end if;
    if p_relation = 'parent' then
      hh := public.ensure_parents_home(p_person);
      if (select count(*) from public.household_members where household_id = hh and kind = 'adult') >= 2 then
        raise exception '% already has two parents listed.', person_name;
      end if;
    else
      hh := public.ensure_home(p_person);
      if p_relation = 'spouse' and exists (
        select 1 from public.household_members
        where household_id = hh and kind = 'adult' and user_id is distinct from p_person
      ) then
        raise exception '% already has a husband or wife listed. Unlink or remove them first.', person_name;
      end if;
    end if;
    was := case when p_relation = 'child' then 'child' else 'adult' end;
    insert into public.household_members (
      household_id, kind, first_name, last_name, dob, gender, school, year_group, added_by
    ) values (
      hh, was, btrim(p_first), nullif(btrim(p_last), ''), p_dob,
      case when was = 'child' then p_gender end,
      case when was = 'child' then nullif(btrim(p_school), '') end,
      case when was = 'child' then nullif(btrim(p_year), '') end,
      me
    ) returning id into row_id;
    if was = 'child' then
      update public.households set has_children = true, updated_at = now()
      where id = hh and has_children is distinct from true;
    end if;
  end if;

  -- The adults of the household, and the person it was written for.
  select array_agg(distinct m.user_id) into told
  from public.household_members m
  where m.household_id = hh and m.user_id is not null and (m.kind = 'adult' or m.user_id = p_person);
  perform public.family_changed_tell(told, hh);
  return row_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Taking somebody written in off
-- ---------------------------------------------------------------------------

create or replace function public.remove_family_person(p_person uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  hh uuid;
  told uuid[];
begin
  if me is null or not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  perform pg_advisory_xact_lock(hashtext('rim.family_links'));
  -- Only somebody written in by hand: an account is unlinked (0319), not removed.
  select household_id into hh from public.household_members where id = p_id and user_id is null;
  if hh is null or (hh is distinct from public.home_of(p_person) and hh is distinct from public.parents_home_of(p_person)) then
    raise exception 'That person is not one written in for this family.';
  end if;
  select array_agg(distinct m.user_id) into told
  from public.household_members m
  where m.household_id = hh and m.user_id is not null and (m.kind = 'adult' or m.user_id = p_person);
  delete from public.household_members where id = p_id;
  perform public.family_changed_tell(told, hh);
end;
$function$;

revoke all on function public.save_family_person(uuid, text, uuid, text, text, date, text, text, text) from public, anon;
revoke all on function public.remove_family_person(uuid, uuid) from public, anon;
grant execute on function public.save_family_person(uuid, text, uuid, text, text, date, text, text, text) to authenticated;
grant execute on function public.remove_family_person(uuid, uuid) to authenticated;

comment on function public.family_of(uuid) is
  'One person''s family for a holder of people.family: the accounts linked (husband or wife, children, parents) and the people written in by hand with their details (0320). No address.';
comment on function public.save_family_person(uuid, text, uuid, text, text, date, text, text, text) is
  'Writes somebody with no account into one person''s household, or changes what is written (people.family): p_relation is what they are to p_person — spouse, child or parent.';
comment on function public.remove_family_person(uuid, uuid) is
  'Takes somebody written in by hand off one person''s household (people.family). An account is unlinked, not removed.';
select public.migration_done(320, '0320_a_family_member_with_no_account_can_be_written_in', '6c6ba80dcfb990ee3cb2dcbba527765f3b877729099eccc899ef6eab645c827d');

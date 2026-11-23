/*
 * A link says husband, wife, son or sister.
 *
 * Whoever links families for them (0319) chose one of three things from a
 * list: "husband or wife", "child" or "parent". The Owner, November 2026:
 * "instead of the option in drop down 'husband or wife', i want separate
 * options as husband, wife, son, sister, etc etc".
 *
 * So the list is eight words: husband, wife, son, daughter, father,
 * mother, brother, sister.
 *
 * **What a word is.** A household still holds the same thing: up to two
 * adults and their children. Six of the words are the three links that
 * were there, with whether the person is a man or a woman said along with
 * it. That is kept on the person's rows in `household_members.gender`,
 * the column a child written in by hand has always had (0149), so one
 * answer serves every word: somebody linked as a son is a brother to the
 * other children and a husband to his wife. Husband and wife say it of
 * both: linking a husband says the other is the wife.
 *
 * **Brothers and sisters are a new link.** Two people are brother and
 * sister by being children of the same household, which is how the
 * children of linked parents already were, without the app saying so.
 * Now it can be asked for directly: linking a sister puts her in the
 * household the person is a child of, making one (with no parents in it
 * yet) where there is none. So she becomes the child of the person's
 * parents too, which is what a sister is; whoever links is told before
 * they confirm. Two people who each have parents of their own listed are
 * refused in words rather than merged.
 *
 *   link_family_as()    links two accounts by one of the eight words,
 *                       and says who else that moved
 *   say_family_word()   says which word somebody already linked or
 *                       written in is, without unlinking them: the
 *                       families linked before today have none
 *   family_of()         hands back each person's word, and the brothers
 *                       and sisters
 *   unlink_family()     takes a brother or sister off too
 *   save_family_person()  writes somebody in by any of the words
 *
 * `link_family()` is unchanged and still answers the three old words, so
 * a phone that has not reloaded keeps working.
 *
 * **What this opens.** Nothing to anybody new. The word is read through
 * `family_of()` (`people.family`: the Owner and a Pastor out of the box,
 * 0327) and by the household itself, which already read each other's
 * rows. Saying a word tells nobody: it changes no household.
 *
 * **One thing mended on the way.** The family's own profile form
 * (`save_household_person`, 0149) blanked the column for an adult on
 * every save, because until now an adult never had it. It leaves an
 * adult's alone.
 */

-- ---------------------------------------------------------------------------
-- What each word means
-- ---------------------------------------------------------------------------

/*
 * `part` is which of a family's four lists the word is; `gender` is what
 * it says of the person, null for the plain words the app used before.
 */
create or replace function public.family_word(p_word text, out part text, out gender text)
language sql
immutable
set search_path = public
as $function$
  select
    case
      when p_word in ('husband', 'wife', 'spouse') then 'spouse'
      when p_word in ('son', 'daughter', 'child') then 'child'
      when p_word in ('father', 'mother', 'parent') then 'parent'
      when p_word in ('brother', 'sister', 'sibling') then 'sibling'
    end,
    case
      when p_word in ('husband', 'son', 'father', 'brother') then 'male'
      when p_word in ('wife', 'daughter', 'mother', 'sister') then 'female'
    end;
$function$;

/* What has been said of an account: it is on their rows, the newest first. */
create or replace function public.family_gender_of(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select gender from public.household_members
  where user_id = uid and gender is not null
  order by created_at desc, id
  limit 1;
$function$;

revoke all on function public.family_word(text) from public, anon, authenticated;
revoke all on function public.family_gender_of(uuid) from public, anon, authenticated;

/*
 * Somebody can be in two households: an adult of their own and a child of
 * their parents'. A row made for them later starts with what the others
 * say, so leaving one household does not forget it.
 */
create or replace function public.household_member_keeps_gender()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.user_id is not null and new.gender is null then
    new.gender := public.family_gender_of(new.user_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.household_member_keeps_gender() from public, anon, authenticated;

drop trigger if exists household_members_keep_gender on public.household_members;
create trigger household_members_keep_gender
  before insert on public.household_members
  for each row execute function public.household_member_keeps_gender();

-- ---------------------------------------------------------------------------
-- Who is in one person's family, with the word for each
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
    'parents', coalesce(jsonb_agg(who order by name) filter (where part = 'parent'), '[]'::jsonb),
    'siblings', coalesce(jsonb_agg(who order by name) filter (where part = 'sibling'), '[]'::jsonb)
  )
  into people
  from (
    select
      case
        when m.household_id = home and m.kind = 'adult' then 'spouse'
        when m.household_id = home and m.kind = 'child' then 'child'
        when m.kind = 'adult' then 'parent'
        -- The other children of the household this person is a child of (0328).
        else 'sibling'
      end as part,
      jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
        'gender', public.family_gender_of(p.id)
      ) as who,
      lower(p.first_name || ' ' || p.last_name) as name
    from public.household_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id <> p_person
      and (m.household_id = home or m.household_id = parents)
  ) linked;

  -- The people written in by hand (0320): whoever may write them in has to
  -- be able to read what is written, to change it or take it off.
  select jsonb_build_object(
    'spouse', coalesce(jsonb_agg(who order by name) filter (where part = 'spouse'), '[]'::jsonb),
    'children', coalesce(jsonb_agg(who order by name) filter (where part = 'child'), '[]'::jsonb),
    'parents', coalesce(jsonb_agg(who order by name) filter (where part = 'parent'), '[]'::jsonb),
    'siblings', coalesce(jsonb_agg(who order by name) filter (where part = 'sibling'), '[]'::jsonb)
  )
  into written
  from (
    select
      case
        when m.household_id = home and m.kind = 'adult' then 'spouse'
        when m.household_id = home and m.kind = 'child' then 'child'
        when m.kind = 'adult' then 'parent'
        else 'sibling'
      end as part,
      jsonb_build_object(
        'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'dob', m.dob,
        'gender', m.gender, 'school', m.school, 'year_group', m.year_group
      ) as who,
      lower(m.first_name || ' ' || coalesce(m.last_name, '')) as name
    from public.household_members m
    where m.user_id is null
      and (m.household_id = home or m.household_id = parents)
  ) by_hand;

  return people || jsonb_build_object(
    'written_people', written,
    -- The count 0319 gave, kept for an app that still reads it.
    'written', jsonb_build_object(
      'spouse', jsonb_array_length(written->'spouse'),
      'children', jsonb_array_length(written->'children'),
      'parents', jsonb_array_length(written->'parents'),
      'siblings', jsonb_array_length(written->'siblings')
    )
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Linking two accounts by a word
-- ---------------------------------------------------------------------------

/*
 * `p_word` is what `p_relative` is to `p_person`. Husband, wife, son,
 * daughter, father and mother are 0319's links, made by `link_family()`
 * with everything it refuses; brother and sister are made here.
 *
 * **Brothers and sisters go together.** When a child was linked to a
 * parent and other accounts were children of the household they were in,
 * 0319 moved that one child and left the rest: the only way to be there
 * then was a parent's account having gone. It would now undo a link
 * somebody asked for by name, and leave a parent written in by hand
 * behind as well. So the rest of that household comes too, the way it
 * already did when the child was the only account in it, and the answer
 * says who (`came`) for the app to say. `link_family()` itself still
 * moves the one, for whoever calls it.
 *
 * It answers with the first names of who else moved (`came`) and, for a
 * brother or sister, of the parents they are now both children of
 * (`parents`): what whoever linked them could not see beforehand.
 */
create or replace function public.link_family_as(p_person uuid, p_relative uuid, p_word text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  w record;
  person_name text;
  relative_name text;
  mine uuid;
  theirs uuid;
  child uuid;
  src uuid;
  dst uuid;
  told uuid[];
  came uuid[] := '{}';
  came_written uuid[] := '{}';
begin
  if me is null or not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  select * into w from public.family_word(p_word);
  if w.part is null then
    raise exception 'Unknown relation.';
  end if;

  if w.part <> 'sibling' then
    -- The household a child is in before they are linked to a parent.
    child := case w.part when 'parent' then p_person when 'child' then p_relative end;
    if child is not null then
      src := public.parents_home_of(child);
    end if;

    perform public.link_family(p_person, p_relative, w.part);

    -- Still there: other accounts were children of it, and 0319 moved
    -- only the one. Their brothers and sisters follow.
    if src is not null and exists (select 1 from public.households where id = src) then
      dst := public.parents_home_of(child);
      -- A parent written in by hand, named like an adult of the new home, is that adult (as 0319).
      delete from public.household_members x
      where x.household_id = src and x.kind = 'adult' and x.user_id is null
        and exists (
          select 1
          from public.household_members d
          left join public.profiles dp on dp.id = d.user_id
          where d.household_id = dst and d.kind = 'adult'
            and lower(btrim(coalesce(dp.first_name, d.first_name))) = lower(btrim(x.first_name))
        );
      select coalesce(array_agg(user_id) filter (where user_id is not null), '{}'),
             coalesce(array_agg(id) filter (where user_id is null and kind = 'child'), '{}')
      into came, came_written
      from public.household_members where household_id = src;
      perform public.merge_households(src, dst, false);
      perform public.family_changed_tell(came, dst);
    end if;
  else
    if p_person is null or p_relative is null or p_person = p_relative then
      raise exception 'Choose two different people.';
    end if;
    -- As 0319: being in a household is what opens it, so linking yourself
    -- into one is people.contacts' to do and not this right's.
    if (p_person = me or p_relative = me) and not public.may(me, 'people.contacts') then
      raise exception 'You cannot link your own brother or sister. Ask the Owner to.';
    end if;
    select first_name into person_name from public.profiles where id = p_person;
    select first_name into relative_name from public.profiles where id = p_relative;
    if person_name is null or relative_name is null then
      raise exception 'That account no longer exists.';
    end if;

    perform pg_advisory_xact_lock(hashtext('rim.family_links'));

    mine := public.parents_home_of(p_person);
    theirs := public.parents_home_of(p_relative);
    if mine is not null and mine = theirs then
      raise exception '% and % are already linked as brother or sister.', person_name, relative_name;
    end if;
    if public.home_of(p_person) is not null and public.home_of(p_person) = public.home_of(p_relative) then
      raise exception '% and % are linked as husband and wife. Unlink that first.', person_name, relative_name;
    end if;
    if (public.home_of(p_person) is not null and theirs = public.home_of(p_person))
       or (public.home_of(p_relative) is not null and mine = public.home_of(p_relative)) then
      raise exception '% and % are linked as parent and child. Unlink that first.', person_name, relative_name;
    end if;

    if mine is not null and theirs is not null then
      -- Each is a child of a household already. One with no parents in it
      -- is only brothers and sisters, and joins the other whole; two sets
      -- of parents cannot both be theirs.
      if not exists (select 1 from public.household_members where household_id = theirs and kind = 'adult') then
        src := theirs;
        dst := mine;
      elsif not exists (select 1 from public.household_members where household_id = mine and kind = 'adult') then
        src := mine;
        dst := theirs;
      else
        raise exception '% and % each have parents of their own listed. Unlink one of them from their parents first.', person_name, relative_name;
      end if;
      select coalesce(array_agg(user_id) filter (where user_id is not null and user_id not in (p_person, p_relative)), '{}'),
             coalesce(array_agg(id) filter (where user_id is null and kind = 'child'), '{}')
      into came, came_written
      from public.household_members where household_id = src;
      perform public.merge_households(src, dst, false);
    elsif mine is not null then
      dst := mine;
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'child', p_relative, me);
    elsif theirs is not null then
      dst := theirs;
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'child', p_person, me);
    else
      dst := public.ensure_parents_home(p_person);
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'child', p_relative, me);
    end if;

    update public.households set has_children = true, updated_at = now()
    where id = dst and has_children is distinct from true;

    -- The two people, whoever came with them, and the parents of the
    -- household where there are any.
    select array_agg(distinct m.user_id) into told
    from public.household_members m
    where m.household_id = dst and m.user_id is not null
      and (m.kind = 'adult' or m.user_id in (p_person, p_relative) or m.user_id = any (came));
    perform public.family_changed_tell(told, dst);
  end if;

  if w.gender is not null then
    update public.household_members set gender = w.gender
    where user_id = p_relative and gender is distinct from w.gender;
    -- Husband and wife say it of both.
    if w.part = 'spouse' then
      update public.household_members
      set gender = case w.gender when 'male' then 'female' else 'male' end
      where user_id = p_person
        and gender is distinct from case w.gender when 'male' then 'female' else 'male' end;
    end if;
  end if;

  return jsonb_build_object(
    'came', coalesce((
      select jsonb_agg(n order by n) from (
        select p.first_name as n from public.profiles p where p.id = any (came)
        union all
        select m.first_name from public.household_members m where m.id = any (came_written)
      ) x
    ), '[]'::jsonb),
    'parents', case when w.part = 'sibling' then coalesce((
      select jsonb_agg(coalesce(p.first_name, m.first_name) order by coalesce(p.first_name, m.first_name))
      from public.household_members m
      left join public.profiles p on p.id = m.user_id
      where m.household_id = dst and m.kind = 'adult'
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Saying which word somebody already there is
-- ---------------------------------------------------------------------------

/*
 * One of `p_relative` (an account) and `p_written` (somebody written in by
 * hand) is who; `p_word` has to be a word for what they already are to
 * `p_person`. A husband cannot be renamed a son: that is unlinking.
 */
create or replace function public.say_family_word(p_person uuid, p_relative uuid, p_written uuid, p_word text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  w record;
  person_name text;
  home uuid;
  parents uuid;
  hh uuid;
  was text;
  stands text;
begin
  if me is null or not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  select * into w from public.family_word(p_word);
  if w.part is null or w.gender is null then
    raise exception 'Unknown relation.';
  end if;
  if (p_relative is null) = (p_written is null) then
    raise exception 'Choose one person.';
  end if;
  select first_name into person_name from public.profiles where id = p_person;
  if person_name is null then
    raise exception 'That account no longer exists.';
  end if;

  perform pg_advisory_xact_lock(hashtext('rim.family_links'));
  home := public.home_of(p_person);
  parents := public.parents_home_of(p_person);

  if p_written is not null then
    select household_id, kind into hh, was from public.household_members where id = p_written and user_id is null;
    stands := case
      when hh is null then null
      when hh = home and was = 'adult' then 'spouse'
      when hh = home then 'child'
      when hh = parents and was = 'adult' then 'parent'
      when hh = parents then 'sibling'
    end;
  else
    if p_relative = p_person then
      raise exception 'Choose two different people.';
    end if;
    stands := case
      when home is not null and public.home_of(p_relative) = home then 'spouse'
      when home is not null and public.parents_home_of(p_relative) = home then 'child'
      when parents is not null and public.home_of(p_relative) = parents then 'parent'
      when parents is not null and public.parents_home_of(p_relative) = parents then 'sibling'
    end;
  end if;
  if stands is null then
    raise exception 'That person is not linked to %.', person_name;
  end if;
  if stands <> w.part then
    raise exception 'That is not what they are to %. Unlink them and link them again to change it.', person_name;
  end if;

  if p_written is not null then
    update public.household_members set gender = w.gender where id = p_written and gender is distinct from w.gender;
  else
    update public.household_members set gender = w.gender
    where user_id = p_relative and gender is distinct from w.gender;
  end if;
  -- Husband and wife say it of both.
  if w.part = 'spouse' then
    update public.household_members
    set gender = case w.gender when 'male' then 'female' else 'male' end
    where user_id = p_person
      and gender is distinct from case w.gender when 'male' then 'female' else 'male' end;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Unlinking, a brother or sister too
-- ---------------------------------------------------------------------------

/*
 * 0319's, with one more thing it can take away: two children of the same
 * household. `p_relative` leaves it, so they stop being the child of its
 * parents as well, which the app says before it is done.
 */
create or replace function public.unlink_family(p_person uuid, p_relative uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  home uuid;
  theirs uuid;
  told uuid[];
begin
  if me is null or not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  if p_person is null or p_relative is null or p_person = p_relative then
    raise exception 'Choose two different people.';
  end if;

  perform pg_advisory_xact_lock(hashtext('rim.family_links'));
  home := public.home_of(p_person);
  theirs := public.home_of(p_relative);

  if home is not null and home = theirs then
    select array_agg(user_id) into told from public.household_members
    where household_id = home and kind = 'adult' and user_id is not null;
    delete from public.household_members where household_id = home and kind = 'adult' and user_id = p_relative;
  elsif home is not null and public.parents_home_of(p_relative) = home then
    select array_agg(user_id) into told from public.household_members
    where household_id = home and user_id is not null and (kind = 'adult' or user_id = p_relative);
    delete from public.household_members where household_id = home and kind = 'child' and user_id = p_relative;
  elsif theirs is not null and public.parents_home_of(p_person) = theirs then
    select array_agg(user_id) into told from public.household_members
    where household_id = theirs and user_id is not null and (kind = 'adult' or user_id = p_person);
    delete from public.household_members where household_id = theirs and kind = 'child' and user_id = p_person;
    home := theirs;
  elsif public.parents_home_of(p_person) is not null
        and public.parents_home_of(p_person) = public.parents_home_of(p_relative) then
    -- Brother and sister (0328): the one named second leaves.
    home := public.parents_home_of(p_person);
    select array_agg(user_id) into told from public.household_members
    where household_id = home and user_id is not null and (kind = 'adult' or user_id in (p_person, p_relative));
    delete from public.household_members where household_id = home and kind = 'child' and user_id = p_relative;
  else
    raise exception 'Those two are not linked.';
  end if;

  perform public.family_changed_tell(told, home);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Writing somebody in by a word
-- ---------------------------------------------------------------------------

/*
 * 0320's, taking any of the words for `p_relation`. An adult written in
 * (a husband, a mother) now keeps which they are; a brother or sister is
 * written into the household the person is a child of.
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
  w record;
  person_name text;
  hh uuid;
  was text;
  said text;
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
        -- A child's form asks; an adult's does not, and keeps what was said.
        gender = case when was = 'child' then p_gender else coalesce(p_gender, gender) end,
        school = case when was = 'child' then nullif(btrim(p_school), '') end,
        year_group = case when was = 'child' then nullif(btrim(p_year), '') end
    where id = row_id;
  else
    select * into w from public.family_word(p_relation);
    if w.part is null then
      raise exception 'Unknown relation.';
    end if;
    if w.part in ('parent', 'sibling') then
      hh := public.ensure_parents_home(p_person);
      if w.part = 'parent'
         and (select count(*) from public.household_members where household_id = hh and kind = 'adult') >= 2 then
        raise exception '% already has two parents listed.', person_name;
      end if;
    else
      hh := public.ensure_home(p_person);
      if w.part = 'spouse' and exists (
        select 1 from public.household_members
        where household_id = hh and kind = 'adult' and user_id is distinct from p_person
      ) then
        raise exception '% already has a husband or wife listed. Unlink or remove them first.', person_name;
      end if;
    end if;
    was := case when w.part in ('child', 'sibling') then 'child' else 'adult' end;
    -- What the form said, and failing that what the word says.
    said := coalesce(p_gender, w.gender);
    insert into public.household_members (
      household_id, kind, first_name, last_name, dob, gender, school, year_group, added_by
    ) values (
      hh, was, btrim(p_first), nullif(btrim(p_last), ''), p_dob, said,
      case when was = 'child' then nullif(btrim(p_school), '') end,
      case when was = 'child' then nullif(btrim(p_year), '') end,
      me
    ) returning id into row_id;
    if was = 'child' then
      update public.households set has_children = true, updated_at = now()
      where id = hh and has_children is distinct from true;
    end if;
    -- Husband and wife say it of both.
    if w.part = 'spouse' and said is not null then
      update public.household_members
      set gender = case said when 'male' then 'female' else 'male' end
      where user_id = p_person
        and gender is distinct from case said when 'male' then 'female' else 'male' end;
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
-- The family's own form leaves an adult's word alone
-- ---------------------------------------------------------------------------

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
        -- An adult's is said by whoever links families (0328), not by this form.
        gender = case when p_kind = 'child' then p_gender else gender end,
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

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on function public.link_family_as(uuid, uuid, text) from public, anon;
revoke all on function public.say_family_word(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.link_family_as(uuid, uuid, text) to authenticated;
grant execute on function public.say_family_word(uuid, uuid, uuid, text) to authenticated;

comment on function public.family_of(uuid) is
  'One person''s family for a holder of people.family: the accounts linked (husband or wife, children, parents, brothers and sisters) with what has been said of each (0328), and the people written in by hand with their details (0320). No address.';
comment on function public.link_family_as(uuid, uuid, text) is
  'Links two accounts as family, directly (people.family): p_word is what p_relative is to p_person — husband, wife, son, daughter, father, mother, brother or sister. Tells both.';
comment on function public.say_family_word(uuid, uuid, uuid, text) is
  'Says which word somebody already linked (p_relative) or written in (p_written) is to p_person (people.family). Changes no household and tells nobody.';
comment on function public.unlink_family(uuid, uuid) is
  'Takes the link between two accounts away (people.family): husband and wife, parent and child, or brother and sister. Tells both.';
comment on function public.save_family_person(uuid, text, uuid, text, text, date, text, text, text) is
  'Writes somebody with no account into one person''s household, or changes what is written (people.family): p_relation is what they are to p_person — any of link_family_as()''s words, or spouse, child or parent.';
select public.migration_done(328, '0328_a_link_says_husband_wife_son_or_sister', '07c1e056712757851406807d3671e0dc561e10f043c2c84308ab81647a85cee0');

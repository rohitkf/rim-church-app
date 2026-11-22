/*
 * Whoever runs the church can link a family.
 *
 * A family is a household (0149), and until now only the family could
 * make one: somebody chose their husband, wife, child or parent on their
 * own profile, the other person was asked, and nothing was linked until
 * they said yes. That is right for people linking themselves, and it
 * leaves most families unlinked: it takes two people to each open their
 * profile, and a child with an account is seldom the one who does.
 *
 * The Owner, November 2026: "I want the owner and admin to have ability
 * to link members. Like husband and wife. Or kids to their parents.
 * (Everyone who's in the app i mean)".
 *
 *   people.family   link two accounts as family, and unlink them. Admins
 *                   out of the box, and the Owner always; a choice in
 *                   every other cell of the grid, like blocking (0279).
 *
 * **It is the same household, made directly.** `link_family()` does what
 * a request answered yes does (`answer_family_link`, 0170): husband and
 * wife become the two adults of one household, and a child joins their
 * parents' household as a child, so a child linked to one of a couple is
 * the child of both. Nothing new is stored and nothing reads families a
 * second way: the profile's Family card, the diary's shared anniversary
 * (`married_couples()`, 0152) and the volunteer export all see a family
 * linked here exactly as one the family linked themselves.
 *
 * **Nobody is asked, and both are told.** There is no request and no yes:
 * the person linking is answering for the church. Everybody whose
 * household changed gets a notification — a sentence nobody wrote, with
 * no name in it (0170: a name is free text and does not go on a lock
 * screen) — and the profile says who. A request still waiting between the
 * two is cleared: it has been answered.
 *
 * **It refuses what it cannot mean, and says which.** Somebody who
 * already has a husband or wife linked; two people already linked the
 * other way (a couple asked to be parent and child); a child already
 * linked to another parent — each is refused with what to do first,
 * rather than quietly marrying two parents or moving a child. A child of
 * two people who are not yet linked is linked by linking the couple
 * first, or the child to one and then the couple.
 *
 * **Somebody written in by hand gives way to the account.** A husband or
 * wife typed in by hand is the entry for the person now linked, so it
 * goes (as it does for a request that names the entry it replaces). A
 * child typed in by hand under the same first name, with the same date
 * of birth where both have one, is that child. A child's hand-written
 * parent named like the parent now linked is that parent. Anybody else
 * written in stays.
 *
 * **What the linker reads is who is linked, and no more.** Households are
 * the family's and `people.contacts`' (0277): the address, the children
 * written in, their schools. `family_of()` hands a holder of
 * `people.family` the accounts linked to one person — names the whole
 * church can already read (0127) — and a count of the people written in
 * by hand, so "no children" is not said of a family that has two. Not an
 * address, not a date of birth, not a hand-written name.
 *
 * **Not your own family, unless households are yours to read anyway.**
 * Being in a household is what opens it: its address, its children.
 * Somebody who could link themselves to anybody could read any family
 * that way, so linking yourself is refused here and stays on the profile,
 * where the other person says yes — except for whoever holds
 * `people.contacts` (the Owner, out of the box), who reads households
 * already.
 *
 * Unlinking takes one account out of the household: a husband or wife
 * leaves it (the address and the children stay with the person whose
 * family was opened), a child leaves their parents' (both parents: it is
 * one household).
 */

-- ---------------------------------------------------------------------------
-- One row in the grid
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.family', 'admin', '{none,all}', 'all'),
  ('people.family', 'head', '{none,all}', 'none'),
  ('people.family', 'assistant', '{none,all}', 'none'),
  ('people.family', 'coordinator', '{none,all}', 'none'),
  ('people.family', 'member', '{none,all}', 'none'),
  ('people.family', 'newcomer', '{none,all}', 'none'),
  ('people.family', 'overwatch', '{none,all}', 'none'),
  ('people.family', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------------
-- Who is linked to one person
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

  return people || jsonb_build_object(
    -- People written in by hand, as a number only: who they are is the family's.
    'written', jsonb_build_object(
      'spouse', (select count(*) from public.household_members where household_id = home and kind = 'adult' and user_id is null),
      'children', (select count(*) from public.household_members where household_id = home and kind = 'child' and user_id is null),
      'parents', (select count(*) from public.household_members where household_id = parents and kind = 'adult' and user_id is null)
    )
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Telling the people whose household changed
-- ---------------------------------------------------------------------------

create or replace function public.family_changed_tell(p_people uuid[], p_ref uuid)
returns void
language sql
security definer
set search_path = public
as $function$
  -- The profile says who; the phone gets a sentence nobody wrote (0170).
  select public.notify_people(
    p_people,
    'family_link_answered',
    p_ref,
    'A church Admin has updated who you are linked with as family. Open your profile to see.'
  );
$function$;

-- ---------------------------------------------------------------------------
-- Linking two accounts
-- ---------------------------------------------------------------------------

/*
 * `p_relation` is what `p_relative` is to `p_person`: their `spouse`,
 * their `child`, or their `parent`.
 */
create or replace function public.link_family(p_person uuid, p_relative uuid, p_relation text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  parent uuid;
  child uuid;
  parent_name text;
  child_name text;
  person_name text;
  relative_name text;
  dst uuid;
  src uuid;
  told uuid[];
begin
  if me is null or not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.';
  end if;
  if p_person is null or p_relative is null or p_person = p_relative then
    raise exception 'Choose two different people.';
  end if;
  if p_relation is null or p_relation not in ('spouse', 'child', 'parent') then
    raise exception 'Unknown relation.';
  end if;
  -- Being in a household is what opens it. Somebody linking themselves to
  -- anybody would read that family's address and children by it, which is
  -- people.contacts' to read and not this right's.
  if (p_person = me or p_relative = me) and not public.may(me, 'people.contacts') then
    raise exception 'Link your own family from your profile, where the other person confirms it.';
  end if;
  select first_name into person_name from public.profiles where id = p_person;
  select first_name into relative_name from public.profiles where id = p_relative;
  if person_name is null or relative_name is null then
    raise exception 'That account no longer exists.';
  end if;

  -- One link at a time: two people linking the same family at once would each read it half made.
  perform pg_advisory_xact_lock(hashtext('rim.family_links'));

  if p_relation = 'spouse' then
    dst := public.home_of(p_person);
    src := public.home_of(p_relative);
    if dst is not null and dst = src then
      raise exception '% and % are already linked as husband and wife.', person_name, relative_name;
    end if;
    if (dst is not null and public.parents_home_of(p_relative) = dst)
       or (src is not null and public.parents_home_of(p_person) = src) then
      raise exception '% and % are linked as parent and child. Unlink that first.', person_name, relative_name;
    end if;
    if exists (
      select 1 from public.household_members
      where household_id = dst and kind = 'adult' and user_id is not null and user_id <> p_person
    ) then
      raise exception '% already has a husband or wife linked. Unlink them first.', person_name;
    end if;
    if exists (
      select 1 from public.household_members
      where household_id = src and kind = 'adult' and user_id is not null and user_id <> p_relative
    ) then
      raise exception '% already has a husband or wife linked. Unlink them first.', relative_name;
    end if;

    dst := public.ensure_home(p_person);
    -- A husband or wife written in by hand, in either home, was the entry for the other.
    delete from public.household_members where household_id = dst and kind = 'adult' and user_id is null;
    perform public.merge_households(src, dst, true);
    if not exists (select 1 from public.household_members where household_id = dst and user_id = p_relative) then
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'adult', p_relative, me);
    end if;
  else
    if p_relation = 'child' then
      parent := p_person; parent_name := person_name; child := p_relative; child_name := relative_name;
    else
      parent := p_relative; parent_name := relative_name; child := p_person; child_name := person_name;
    end if;

    dst := public.home_of(parent);
    if dst is not null and public.home_of(child) = dst then
      raise exception '% and % are linked as husband and wife. Unlink that first.', parent_name, child_name;
    end if;
    if dst is not null and public.parents_home_of(child) = dst then
      raise exception '% is already linked as the child of %.', child_name, parent_name;
    end if;
    if public.home_of(child) is not null and public.parents_home_of(parent) = public.home_of(child) then
      raise exception 'It is the other way round already: % is linked as the child of %. Unlink that first.', parent_name, child_name;
    end if;
    src := public.parents_home_of(child);
    if src is not null and exists (
      select 1 from public.household_members where household_id = src and kind = 'adult' and user_id is not null
    ) then
      raise exception '% is already linked to a parent. If the two parents are husband and wife, link them as that and % is the child of both. Otherwise unlink % from that parent first.', child_name, child_name, child_name;
    end if;

    dst := public.ensure_home(parent);
    -- This child, written in by hand before they had an account: the account takes its place.
    delete from public.household_members w
    using public.profiles p
    where w.household_id = dst and w.kind = 'child' and w.user_id is null
      and p.id = child
      and lower(btrim(w.first_name)) = lower(btrim(p.first_name))
      and (w.dob is null or p.dob is null or w.dob = p.dob);
    if src is not null and exists (
      select 1 from public.household_members where household_id = src and user_id is not null and user_id <> child
    ) then
      -- Other accounts are still in the household the child was in (brothers
      -- and sisters whose linked parent has gone): only this child moves.
      -- Merging would hand the new parent children nobody linked to them.
      delete from public.household_members where household_id = src and kind = 'child' and user_id = child;
    elsif src is not null then
      -- The child's own hand-written parents: one named like an adult of this home is that adult.
      delete from public.household_members w
      where w.household_id = src and w.kind = 'adult' and w.user_id is null
        and exists (
          select 1
          from public.household_members d
          left join public.profiles dp on dp.id = d.user_id
          where d.household_id = dst and d.kind = 'adult'
            and lower(btrim(coalesce(dp.first_name, d.first_name))) = lower(btrim(w.first_name))
        );
      perform public.merge_households(src, dst, false);
    end if;
    if not exists (select 1 from public.household_members where household_id = dst and user_id = child) then
      insert into public.household_members (household_id, kind, user_id, added_by) values (dst, 'child', child, me);
    end if;
  end if;

  -- "Do you have children?" (0150) is answered by there being one: a merge carries the children, not the answer.
  update public.households set has_children = true, updated_at = now()
  where id = dst and has_children is distinct from true
    and exists (select 1 from public.household_members where household_id = dst and kind = 'child');

  -- A request still waiting between the two has been answered.
  delete from public.family_link_requests
  where (from_user = p_person and to_user = p_relative) or (from_user = p_relative and to_user = p_person);

  -- The two people, and the other adult of the household: their family changed too.
  select array_agg(distinct m.user_id) into told
  from public.household_members m
  where m.household_id = dst and m.user_id is not null
    and (m.kind = 'adult' or m.user_id in (p_person, p_relative));
  perform public.family_changed_tell(told, dst);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Unlinking them
-- ---------------------------------------------------------------------------

/*
 * Takes the link between two accounts away, whichever it is. Husband and
 * wife: `p_relative` leaves `p_person`'s household. Parent and child: the
 * child leaves the parents' household, which is both parents'.
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
  else
    raise exception 'Those two are not linked.';
  end if;

  perform public.family_changed_tell(told, home);
end;
$function$;

revoke all on function public.family_of(uuid) from public, anon;
revoke all on function public.link_family(uuid, uuid, text) from public, anon;
revoke all on function public.unlink_family(uuid, uuid) from public, anon;
revoke all on function public.family_changed_tell(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.family_of(uuid) to authenticated;
grant execute on function public.link_family(uuid, uuid, text) to authenticated;
grant execute on function public.unlink_family(uuid, uuid) to authenticated;

comment on function public.family_of(uuid) is
  'The accounts linked to one person as family (husband or wife, children, parents) and how many people are written in by hand, for a holder of people.family. No address, no dates, no hand-written names.';
comment on function public.link_family(uuid, uuid, text) is
  'Links two accounts as family without asking either (people.family): p_relation is what p_relative is to p_person — spouse, child or parent. The same household a request answered yes makes.';
comment on function public.unlink_family(uuid, uuid) is
  'Takes the family link between two accounts away (people.family).';
select public.migration_done(319, '0319_whoever_runs_the_church_can_link_a_family', 'c990833b3d1e928ff19dacbcbe919d0f1815a8dff58e18e87531aad70596c109');

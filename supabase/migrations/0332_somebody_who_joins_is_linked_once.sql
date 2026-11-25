-- Somebody who joins the app is linked once.
--
-- A person with no account can be known to the church in two places: on
-- the guest roll (0091), because they serve, and written into a family
-- by hand (0320), because they are somebody's husband, child or mother.
-- The two lists do not know about each other, so when that person signed
-- up they had to be linked twice, on two pages, by somebody who had to
-- remember both. The Owner (November 2026): "build one step that links
-- them in both places".
--
-- person_joined(account, guest, written) is that step. Either of the two
-- can be left out; given both, both happen or neither does. `written` is
-- a list: somebody can be written into two families, their husband's as
-- his wife and their parents' as a daughter.
--
--   * the guest: exactly what "Now a member" does (guests.became_member),
--     so the teams, answers, rota roles and sessions move as they always
--     have (0161, 0166, 0167, 0293). It asks for the right the guest list
--     asks for, svc.guests.
--   * the written-in entry: the account takes its place in that family.
--     What the entry is (a husband or wife, a child, a parent, a brother or
--     sister) is read from where it is written, and the link is made by
--     link_family_as (0328), so every refusal that has is this one's too
--     and the family is told the same way. It asks for people.family.
--
-- The entry is chosen by whoever links, not guessed from the name: 0319
-- lets a written child give way only to an account of the same first
-- name, and "Sam" written in for "Samuel" stayed behind as a second
-- person. Here the linker has said who it is, so the entry goes.
--
-- Nothing is taken away: both pages still link on their own.

create or replace function public.person_joined(
  p_account uuid,
  p_guest uuid default null,
  p_written uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  g public.guests%rowtype;
  w public.household_members%rowtype;
  entry uuid;
  anchor uuid;
  word text;
  linked_guest boolean := false;
  linked jsonb := '[]'::jsonb;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_account is null or not exists (select 1 from public.profiles where id = p_account) then
    raise exception 'That account no longer exists.';
  end if;
  if p_guest is null and coalesce(cardinality(p_written), 0) = 0 then
    raise exception 'Choose who they were: somebody on the guest list, or somebody written into a family.';
  end if;

  if p_guest is not null then
    if not public.may(me, 'svc.guests') then
      raise exception 'You do not have permission to change the guest list.' using errcode = '42501';
    end if;
    select * into g from public.guests where id = p_guest for update;
    if not found then
      raise exception 'That guest is no longer on the list.';
    end if;
    if g.became_member is not null and g.became_member <> p_account then
      raise exception '% is already linked to another account. Undo that first.', g.name;
    end if;
    if g.became_member is null then
      update public.guests set became_member = p_account where id = p_guest;
      linked_guest := true;
    end if;
  end if;

  if coalesce(cardinality(p_written), 0) > 0 and not public.may(me, 'people.family') then
    raise exception 'You do not have permission to link families.' using errcode = '42501';
  end if;

  foreach entry in array coalesce(p_written, '{}'::uuid[]) loop
    anchor := null;
    select * into w from public.household_members where id = entry and user_id is null for update;
    if not found then
      raise exception 'That written-in entry is no longer there.';
    end if;

    if w.kind = 'adult' then
      -- Beside an adult on the app, they are that person's husband or wife.
      select m.user_id into anchor
      from public.household_members m
      where m.household_id = w.household_id and m.kind = 'adult'
        and m.user_id is not null and m.user_id <> p_account
      order by m.created_at, m.id limit 1;
      if anchor is not null then
        word := case w.gender when 'male' then 'husband' when 'female' then 'wife' else 'spouse' end;
      else
        -- Otherwise they were written in as the parent of a child on the app.
        select m.user_id into anchor
        from public.household_members m
        where m.household_id = w.household_id and m.kind = 'child'
          and m.user_id is not null and m.user_id <> p_account
        order by m.created_at, m.id limit 1;
        word := case w.gender when 'male' then 'father' when 'female' then 'mother' else 'parent' end;
      end if;
    else
      -- A child of the adult on the app, where there is one.
      select m.user_id into anchor
      from public.household_members m
      where m.household_id = w.household_id and m.kind = 'adult'
        and m.user_id is not null and m.user_id <> p_account
      order by m.created_at, m.id limit 1;
      if anchor is not null then
        word := case w.gender when 'male' then 'son' when 'female' then 'daughter' else 'child' end;
      else
        -- Otherwise a brother or sister of a child on the app.
        select m.user_id into anchor
        from public.household_members m
        where m.household_id = w.household_id and m.kind = 'child'
          and m.user_id is not null and m.user_id <> p_account
        order by m.created_at, m.id limit 1;
        word := case w.gender when 'male' then 'brother' when 'female' then 'sister' else 'sibling' end;
      end if;
    end if;

    if anchor is null then
      raise exception 'Nobody else in that family is on the app, so there is nobody to link them to.';
    end if;

    -- The entry is this person, on the linker's word: it goes, and the
    -- account is linked where it stood. A refusal below undoes both.
    delete from public.household_members where id = entry;
    perform public.link_family_as(anchor, p_account, word);
    linked := linked || jsonb_build_object(
      'word', word,
      'beside', (select first_name from public.profiles where id = anchor)
    );
  end loop;

  return jsonb_build_object('guest', linked_guest, 'family', linked);
end;
$function$;

revoke all on function public.person_joined(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.person_joined(uuid, uuid, uuid[]) to authenticated;

comment on function public.person_joined(uuid, uuid, uuid[]) is
  'Somebody who was a guest, written into a family by hand, or both, now has an account: the guest is marked a member and the account takes the written entry''s place, together or not at all (0332). Each half asks for its own right: svc.guests, people.family.';

notify pgrst, 'reload schema';
select public.migration_done(332, '0332_somebody_who_joins_is_linked_once', '5f129707c1667150b9abc43ab911ce5239712a12c60320cf1d55f462f8e9001c');

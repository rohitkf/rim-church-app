/*
 * Every family, on one page.
 *
 * Whoever holds `people.family` (0319) links two accounts from a button on
 * one person's card on Volunteers, and reads that one person's family
 * through `family_of()`. There was nowhere to see the families: which
 * ones the church has linked, who is in each, and who is still on their
 * own. The Owner asked (November 2026) for a page to see and link
 * families, to search for somebody and link accounts together, and to see
 * a family drawn as a tree.
 *
 *   families()   every household that is a family (two people or more),
 *                with who is in it: the accounts by name, and the people
 *                written in by hand (0320) by name.
 *
 * **What it hands over is what `family_of()` already does, for everybody
 * at once.** Names of accounts, which the whole church can read (0127),
 * and the names written in by hand, which a holder of `people.family` can
 * already read one family at a time to change or remove them. Not an
 * address, not a date of birth, not a school: those stay the family's and
 * `people.contacts`' (0277). A child's details are on that person's own
 * family, where 0320 put them.
 *
 * **A household of one is not a family.** Since everybody gives an
 * address (0301) nearly everybody has a household; one adult alone in it
 * is somebody not linked to anybody, and the page finds them by leaving
 * them out of this.
 *
 * Somebody can be in two: a child of their parents' household and an
 * adult of their own. Both are returned, and the page draws the tree from
 * `family_of()`, which already reads the two together.
 */

create or replace function public.families()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not public.may(auth.uid(), 'people.family') then
    raise exception 'You do not have permission to link families.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(f.household order by f.sort, f.id)
    from (
      select
        h.id,
        jsonb_build_object(
          'id', h.id,
          'members', jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'user_id', m.user_id,
              'kind', m.kind,
              'first_name', coalesce(p.first_name, m.first_name, ''),
              'last_name', coalesce(p.last_name, m.last_name, '')
            )
            -- The adults, then the children, each by name.
            order by (m.kind <> 'adult'), lower(coalesce(p.first_name, m.first_name, '')), m.id
          )
        ) as household,
        -- Filed under the first adult's last name, the way a family is looked for.
        min(lower(coalesce(p.last_name, m.last_name, '') || ' ' || coalesce(p.first_name, m.first_name, '')))
          filter (where m.kind = 'adult') as sort
      from public.households h
      join public.household_members m on m.household_id = h.id
      left join public.profiles p on p.id = m.user_id
      group by h.id
      having count(*) >= 2
    ) f
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.families() from public, anon;
grant execute on function public.families() to authenticated;
select public.migration_done(326, '0326_every_family_on_one_page', 'b3a15b6543cc0cf14488454335086c70c94eb8a530270418ce337909053cd5f6');

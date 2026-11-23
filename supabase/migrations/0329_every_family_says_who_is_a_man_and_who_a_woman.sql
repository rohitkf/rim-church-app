/*
 * Every family says who is a man and who is a woman.
 *
 * `families()` (0326) hands over every household that is a family, with
 * who is in it by name. The Families page drew them as trees, where a
 * line between two boxes had no word on it, and the word for somebody
 * (wife, son, father) was only known on one person's own tree, read from
 * `family_of()`.
 *
 * The Owner, November 2026: "the relationship org chart is bit weird. I
 * was thinking to be like a graph kinda one like neo4j where
 * relationships between nodes are all connected and named and labelled
 * properly".
 *
 * A line between two people that says "Father · Daughter" needs to know
 * which each of them is, for every pair in every family at once. That is
 * the one thing `families()` did not carry. So each member now comes with
 * `gender`: for an account, what has been said of them by a word (0328,
 * `family_gender_of`); for somebody written in, what is on their row.
 * Null where nobody has said, and the line then says "Parent · Child".
 *
 * **What this opens.** Nothing to anybody new: the same right
 * (`people.family`), which already reads the same thing one person at a
 * time through `family_of()`. Still no address, date of birth or school.
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
              'last_name', coalesce(p.last_name, m.last_name, ''),
              -- What a word has said of them (0328): an account's is on any of their rows.
              'gender', case when m.user_id is not null then public.family_gender_of(m.user_id) else m.gender end
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

comment on function public.families() is
  'Every household that is a family (two people or more) for a holder of people.family: who is in it by name, and what a word has said each is (0329). No address, date of birth or school.';
select public.migration_done(329, '0329_every_family_says_who_is_a_man_and_who_a_woman', '19e1fbe332c81d672528017decb836362b936ed9c6dac07fe4f10a13c8778cc9');

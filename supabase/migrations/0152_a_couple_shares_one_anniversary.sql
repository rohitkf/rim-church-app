-- A couple shares one anniversary.
--
-- The diary drew a wedding anniversary once per person, so a husband and
-- wife turned up as two rows on the same day, each saying the same number
-- of years. It should be one row with both names on it.
--
-- Knowing who is married to whom means reading households, and households
-- are the family's and the Owner's alone (0149). So rather than opening
-- them, this hands out the one fact the diary needs: which two accounts
-- are the adults of the same home. Nothing else about the household —
-- not its address, not its children, not anybody written in by hand —
-- leaves it.
--
-- Both have to be linked accounts. An adult only becomes a linked member
-- of somebody's home by confirming a request, so a pair here is two people
-- who each said yes; a spouse written in by hand is not an account and
-- never pairs. It is the same rule the profile uses to call the other
-- adult in your home your spouse.
create or replace function public.married_couples()
returns table (a uuid, b uuid)
language sql
stable
security definer
set search_path = public
as $function$
  select x.user_id, y.user_id
  from public.household_members x
  join public.household_members y
    on y.household_id = x.household_id
   and y.kind = 'adult'
   and y.user_id is not null
   and y.user_id > x.user_id
  where auth.uid() is not null
    and x.kind = 'adult'
    and x.user_id is not null;
$function$;

revoke all on function public.married_couples() from public, anon;
grant execute on function public.married_couples() to authenticated;

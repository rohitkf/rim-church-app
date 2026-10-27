/*
 * The Clock In page, team by team (0191, 0192).
 *
 * A clock-in belongs to a person and a day, not a team — somebody on Media
 * and Welcome clocks in once. The page groups them by the teams they were
 * on that day, so a head can see their own people together; this says
 * which those were, from the same duties the clock-in itself was checked
 * against. Only to somebody who may see the page; nobody else gets a row.
 */
create or replace function public.clock_in_day_teams(on_day date)
returns table (user_id uuid, department_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct c.user_id, d.department_id
  from public.clock_ins c
  cross join lateral public.clock_in_duties(c.user_id, c.on_date) d
  where c.on_date = on_day
    and public.may_see_clock_ins(auth.uid());
$$;

revoke all on function public.clock_in_day_teams(date) from public, anon;
grant execute on function public.clock_in_day_teams(date) to authenticated;

notify pgrst, 'reload schema';

-- A poll says whether its answers are anonymous, and the church says who
-- may see the names on an anonymous one.
--
-- Until now every answer row — option and person — went to everybody the
-- poll was for, and the page simply did not draw the names. That is not
-- anonymity; it is a page being polite. Now:
--
--   * a poll is `anonymous` (the default) or named. On a named poll
--     everybody it is for sees who picked what.
--   * on an anonymous poll everybody sees the counts and their own answer.
--     The Owner sees every name, always. Whether Admins, or Admins and the
--     team's Head and Assisting Head, see them too is the church's choice
--     (`poll_voters_seen_by`: owner · admins · leads).
--   * the counts come from poll_tallies(), which runs as the owner and
--     answers only for polls the caller may see, so hiding the rows does
--     not hide the result.
--
-- Polls that already exist become anonymous: nobody was shown their names
-- before, and nobody should be shown them now by a migration.

alter table public.team_polls
  add column if not exists anonymous boolean not null default true;

alter table public.app_settings
  add column if not exists poll_voters_seen_by text not null default 'owner'
    check (poll_voters_seen_by in ('owner', 'admins', 'leads'));

/* Who may see which person gave which answer on this poll. */
create or replace function public.may_see_poll_voters(poll uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_polls p
    where p.id = poll
      and public.poll_is_for_me(p.audience, p.department_id, p.service_id, p.recipient_ids, p.created_by)
      and (
        not p.anonymous
        or public.is_super_admin(auth.uid())
        or (
          (select s.poll_voters_seen_by from public.app_settings s limit 1) in ('admins', 'leads')
          and public.is_admin(auth.uid())
        )
        or (
          (select s.poll_voters_seen_by from public.app_settings s limit 1) = 'leads'
          and p.department_id is not null
          and public.is_dept_head_or_assisting(auth.uid(), p.department_id)
        )
      )
  );
$$;

revoke all on function public.may_see_poll_voters(uuid) from public, anon;
grant execute on function public.may_see_poll_voters(uuid) to authenticated;

/* An answer row is the voter's own, or the viewer may see the names. */
alter policy team_poll_votes_select on public.team_poll_votes
  using (user_id = auth.uid() or public.may_see_poll_voters(poll_id));

/*
 * The counts, for everybody the poll is for. `voters` is the number of
 * people who answered, which on a pick-any poll is fewer than the votes.
 */
create or replace function public.poll_tallies(p_polls uuid[])
returns table (poll_id uuid, option_id uuid, votes integer, voters integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.poll_id,
         v.option_id,
         count(*)::integer as votes,
         (select count(distinct w.user_id)
            from public.team_poll_votes w
           where w.poll_id = v.poll_id)::integer as voters
  from public.team_poll_votes v
  where v.poll_id = any (p_polls)
    and public.may_see_poll(v.poll_id)
  group by v.poll_id, v.option_id;
$$;

revoke all on function public.poll_tallies(uuid[]) from public, anon;
grant execute on function public.poll_tallies(uuid[]) to authenticated;

notify pgrst, 'reload schema';

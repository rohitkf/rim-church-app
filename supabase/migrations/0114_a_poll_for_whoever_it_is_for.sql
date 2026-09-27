/*
 * A poll is for whoever it is addressed to.
 *
 * Polls lived inside a team's chat and could only ask that team. A church
 * asks wider questions — which Sunday suits the picnic, who is coming to
 * the retreat — and narrower ones — the six people who can drive. So a
 * poll now has an audience, and a Polls page of its own:
 *
 *   everyone  — anybody signed in, Church Members included;
 *   team      — one team, as before (its members and whoever leads it);
 *   people    — the people named, and nobody else;
 *   service   — whoever the rota puts on a service, or only one team's
 *               people on it.
 *
 * Who may ask: an Admin, any audience; a Head or Assisting Head, their own
 * team, or their own team's people at a service. The existing team polls
 * are all `team` and carry on exactly as they were.
 *
 * Who sees a poll — its options, its answers — is one rule,
 * poll_is_for_me, asked by every policy here (directly of the poll's row,
 * and through may_see_poll for its options and votes), so it cannot differ
 * between the question and the votes cast on it. The author and Admins
 * always see it. Notifying (in the app and on the phone) follows the
 * same audience.
 */

alter table public.team_polls
  add column if not exists audience text not null default 'team',
  add column if not exists service_id uuid references public.services(id) on delete cascade,
  add column if not exists recipient_ids uuid[] not null default '{}';

alter table public.team_polls alter column department_id drop not null;

alter table public.team_polls drop constraint if exists team_polls_audience_check;
alter table public.team_polls add constraint team_polls_audience_check check (
  (audience = 'everyone')
  or (audience = 'team' and department_id is not null)
  or (audience = 'people' and cardinality(recipient_ids) > 0)
  or (audience = 'service' and service_id is not null)
);

create index if not exists team_polls_service_idx on public.team_polls (service_id);

/*
 * The rule, as a function of the poll's own columns — so the table's
 * policy can ask it of the row in hand, including one being inserted and
 * returned in the same statement, which a lookup by id would not yet see.
 */
create or replace function public.poll_is_for_me(
  p_audience text,
  p_department uuid,
  p_service uuid,
  p_recipients uuid[],
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin(auth.uid())
    or p_created_by = auth.uid()
    or p_audience = 'everyone'
    or (p_audience = 'team' and public.may_read_team(p_department))
    or (p_audience = 'people' and auth.uid() = any (p_recipients))
    or (
      p_audience = 'service'
      and exists (
        select 1 from public.rota_assignments a
        where a.service_id = p_service
          and a.user_id = auth.uid()
          and (p_department is null or a.department_id = p_department)
      )
    )
  );
$$;

revoke all on function public.poll_is_for_me(text, uuid, uuid, uuid[], uuid) from public, anon;
grant execute on function public.poll_is_for_me(text, uuid, uuid, uuid[], uuid) to authenticated;

/* The same rule by poll id, for a poll's options and votes. */
create or replace function public.may_see_poll(poll uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_polls p
    where p.id = poll
      and public.poll_is_for_me(p.audience, p.department_id, p.service_id, p.recipient_ids, p.created_by)
  );
$$;

revoke all on function public.may_see_poll(uuid) from public, anon;
grant execute on function public.may_see_poll(uuid) to authenticated;

/* Who a poll reaches when it is posted: the same audience it is visible to. */
create or replace function public.poll_recipients(p public.team_polls)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select case p.audience
    when 'everyone' then array(select id from public.profiles)
    when 'team' then array(
      select user_id from public.department_members where department_id = p.department_id
      union
      select user_id from public.user_roles
      where department_id = p.department_id and role_type in ('department_head', 'assisting_head')
    )
    when 'people' then array(select id from public.profiles where id = any (p.recipient_ids))
    when 'service' then array(
      select distinct a.user_id from public.rota_assignments a
      where a.service_id = p.service_id
        and (p.department_id is null or a.department_id = p.department_id)
    )
    else '{}'::uuid[]
  end;
$$;

create or replace function public.notify_on_team_poll()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- The poll itself as the reference, so the bell can open it.
  perform public.notify_people(public.poll_recipients(new), 'team_poll', new.id, new.question);
  return new;
end;
$function$;

-- Reading.
drop policy if exists team_polls_select on public.team_polls;
create policy team_polls_select on public.team_polls
  for select using (public.poll_is_for_me(audience, department_id, service_id, recipient_ids, created_by));

drop policy if exists team_poll_options_select on public.team_poll_options;
create policy team_poll_options_select on public.team_poll_options
  for select using (public.may_see_poll(poll_id));

drop policy if exists team_poll_votes_select on public.team_poll_votes;
create policy team_poll_votes_select on public.team_poll_votes
  for select using (public.may_see_poll(poll_id));

drop policy if exists team_poll_votes_insert on public.team_poll_votes;
create policy team_poll_votes_insert on public.team_poll_votes
  for insert with check (
    user_id = auth.uid() and public.may_see_poll(poll_id) and public.poll_is_open(poll_id)
  );

-- Asking. An Admin may address anybody; a Head their own team, whole or at
-- a service. Changing or deleting a poll is its author's, its team Head's
-- or an Admin's.
drop policy if exists team_polls_write on public.team_polls;
drop policy if exists team_polls_insert on public.team_polls;
create policy team_polls_insert on public.team_polls
  for insert with check (
    created_by = auth.uid()
    and (
      public.is_admin(auth.uid())
      or (
        audience in ('team', 'service')
        and department_id is not null
        and public.is_dept_head_or_assisting(auth.uid(), department_id)
      )
    )
  );

drop policy if exists team_polls_change on public.team_polls;
create policy team_polls_change on public.team_polls
  for update using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
    or (department_id is not null and public.is_dept_head_or_assisting(auth.uid(), department_id))
  ) with check (
    public.is_admin(auth.uid())
    or (
      audience in ('team', 'service')
      and department_id is not null
      and public.is_dept_head_or_assisting(auth.uid(), department_id)
    )
  );

drop policy if exists team_polls_delete on public.team_polls;
create policy team_polls_delete on public.team_polls
  for delete using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
    or (department_id is not null and public.is_dept_head_or_assisting(auth.uid(), department_id))
  );

-- A poll's options are written by whoever may write the poll.
drop policy if exists team_poll_options_write on public.team_poll_options;
create policy team_poll_options_write on public.team_poll_options
  for all using (
    exists (
      select 1 from public.team_polls p
      where p.id = poll_id
        and (
          public.is_admin(auth.uid())
          or p.created_by = auth.uid()
          or (p.department_id is not null and public.is_dept_head_or_assisting(auth.uid(), p.department_id))
        )
    )
  ) with check (
    exists (
      select 1 from public.team_polls p
      where p.id = poll_id
        and (
          public.is_admin(auth.uid())
          or p.created_by = auth.uid()
          or (p.department_id is not null and public.is_dept_head_or_assisting(auth.uid(), p.department_id))
        )
    )
  );

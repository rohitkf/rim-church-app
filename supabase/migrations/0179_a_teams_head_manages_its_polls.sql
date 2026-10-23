/*
 * A team's Head manages that team's polls.
 *
 * 0177 kept changing and removing a poll to its asker and Admins. The
 * church wants the team's Heads in too — a Head or an Assisting Head, who
 * are the same in every rule — but only for a poll that is the team's own:
 * one addressed to the team, or to the team's people at a service
 * (`department_id` is set). A poll for everyone, for named people, or for
 * everybody serving at a service has no team, so stays the asker's and the
 * Admins'.
 *
 * Unlike before 0177 this asks for the role itself, not `msg.polls` for
 * the team in the grid: a Coordinator or member the grid lets ask a team
 * poll still manages only their own.
 *
 * A Head cannot manage what they cannot see, and a poll for their team's
 * people at a service was visible only to whoever the rota put on it. So
 * a Head now also sees every poll that is their team's. Who is asked, and
 * told, is unchanged (poll_recipients reads the audience, not this).
 */

create or replace function public.poll_is_for_me(
  p_audience text,
  p_department uuid,
  p_service uuid,
  p_recipients uuid[],
  p_created_by uuid,
  p_include_guests boolean,
  p_guest_ids uuid[]
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
    or (p_department is not null and public.is_dept_head_or_assisting(auth.uid(), p_department))
    or (
      (
        p_audience = 'everyone'
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
      )
      and public.poll_admits(p_audience, p_department, p_service, p_include_guests, p_guest_ids, auth.uid())
    )
  );
$$;

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
    or (
      created_by = auth.uid()
      and (
        public.may(auth.uid(), 'msg.polls')
        or (
          audience in ('team', 'service')
          and department_id is not null
          and public.may(auth.uid(), 'msg.polls', department_id)
        )
      )
    )
  );

drop policy if exists team_polls_delete on public.team_polls;
create policy team_polls_delete on public.team_polls
  for delete using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
    or (department_id is not null and public.is_dept_head_or_assisting(auth.uid(), department_id))
  );

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

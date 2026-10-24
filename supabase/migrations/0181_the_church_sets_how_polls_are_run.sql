/*
 * The church sets how its polls are run.
 *
 * Three choices, beside the one it already had (who sees the names on an
 * anonymous poll, `poll_voters_seen_by`, 0172):
 *
 *   poll_top_count    — how many of a poll's most-picked options are
 *                       lifted to the top of the card and marked. 0 is
 *                       off; the default is 2. The counts are everybody's
 *                       to read already (poll_tallies), so this is the
 *                       screen's to draw, not a rule to enforce.
 *   poll_top_seen_by  — who sees that: `askers` (whoever asked it and the
 *                       Admins, the Owner among them — the default),
 *                       `leads` (and the Heads of the poll's team), or
 *                       `everyone` it is for.
 *   poll_managed_by   — who may edit or delete a poll besides its asker
 *                       and the Admins: `leads` adds the Head and
 *                       Assisting Head of the poll's own team (0179, the
 *                       default, so nothing changes today); `askers` keeps
 *                       it to the asker and the Admins (as 0177 had it).
 *                       This one is a real rule: the policies below read it.
 */

alter table public.app_settings
  add column if not exists poll_top_count integer not null default 2
    check (poll_top_count between 0 and 5),
  add column if not exists poll_top_seen_by text not null default 'askers'
    check (poll_top_seen_by in ('askers', 'leads', 'everyone')),
  add column if not exists poll_managed_by text not null default 'leads'
    check (poll_managed_by in ('askers', 'leads'));

drop policy if exists team_polls_change on public.team_polls;
create policy team_polls_change on public.team_polls
  for update using (
    public.is_admin(auth.uid())
    or created_by = auth.uid()
    or (
      department_id is not null
      and (select s.poll_managed_by from public.app_settings s limit 1) = 'leads'
      and public.is_dept_head_or_assisting(auth.uid(), department_id)
    )
  ) with check (
    public.is_admin(auth.uid())
    or (
      audience in ('team', 'service')
      and department_id is not null
      and (select s.poll_managed_by from public.app_settings s limit 1) = 'leads'
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
    or (
      department_id is not null
      and (select s.poll_managed_by from public.app_settings s limit 1) = 'leads'
      and public.is_dept_head_or_assisting(auth.uid(), department_id)
    )
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
          or (
            p.department_id is not null
            and (select s.poll_managed_by from public.app_settings s limit 1) = 'leads'
            and public.is_dept_head_or_assisting(auth.uid(), p.department_id)
          )
        )
    )
  ) with check (
    exists (
      select 1 from public.team_polls p
      where p.id = poll_id
        and (
          public.is_admin(auth.uid())
          or p.created_by = auth.uid()
          or (
            p.department_id is not null
            and (select s.poll_managed_by from public.app_settings s limit 1) = 'leads'
            and public.is_dept_head_or_assisting(auth.uid(), p.department_id)
          )
        )
    )
  );

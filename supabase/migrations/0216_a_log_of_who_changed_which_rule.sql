/*
 * A log of who changed which rule.
 *
 * The grid (role_permissions), the teams' own rules (department_permissions,
 * 0162) and the grants (permission_grants, 0208) hold only what is true
 * now. When somebody asks "since when can Asha change the rota, and who
 * said so?", nothing could answer. Now every change to any of the three is
 * a row here: when, by whom (auth.uid(); none when the app itself made it,
 * in a migration), which rule, and what it was before and after.
 *
 *   kind        'cell' (the church's), 'team' (one team's own) or 'grant'
 *   before      the reach before — null when there was no row: the
 *   after       app's default for a cell, "as the church" for a team's,
 *               nothing for a grant — and after, the same way
 *
 * A grant's leads_only (0213) is logged before and after too. Team and
 * person are kept as ids without a foreign key, so a row outlives the
 * team or the person it names — and so removing somebody, which takes
 * their grants with them, is never held up by its own log.
 *
 * Readable by whoever may change the grid (may(..., 'app.permissions'):
 * the Owner and the Admins); written only by the trigger.
 */

create table public.permission_changes (
  id uuid primary key default gen_random_uuid(),
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid,
  kind text not null check (kind in ('cell', 'team', 'grant')),
  capability text not null,
  role_key text,
  department_id uuid,
  user_id uuid,
  before text,
  after text,
  leads_only_before boolean,
  leads_only_after boolean
);

comment on table public.permission_changes is
  'Every change to role_permissions, department_permissions and permission_grants, with who made it (0216).';

create index permission_changes_changed_at on public.permission_changes (changed_at desc);

alter table public.permission_changes enable row level security;

create policy permission_changes_select on public.permission_changes
  for select to authenticated
  using ((select public.may((select auth.uid()), 'app.permissions')));

revoke insert, update, delete, truncate on public.permission_changes from anon, authenticated;

create or replace function public.log_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'role_permissions' then
    if tg_op = 'UPDATE' and old.reach is not distinct from new.reach then
      return null;
    end if;
    insert into public.permission_changes (changed_by, kind, capability, role_key, before, after)
    values (
      auth.uid(), 'cell',
      coalesce(new.capability, old.capability), coalesce(new.role_key, old.role_key),
      case when tg_op <> 'INSERT' then old.reach end,
      case when tg_op <> 'DELETE' then new.reach end
    );
  elsif tg_table_name = 'department_permissions' then
    if tg_op = 'UPDATE' and old.reach is not distinct from new.reach then
      return null;
    end if;
    insert into public.permission_changes (changed_by, kind, capability, role_key, department_id, before, after)
    values (
      auth.uid(), 'team',
      coalesce(new.capability, old.capability), coalesce(new.role_key, old.role_key),
      coalesce(new.department_id, old.department_id),
      case when tg_op <> 'INSERT' then old.reach end,
      case when tg_op <> 'DELETE' then new.reach end
    );
  else
    if tg_op = 'UPDATE' and old.reach is not distinct from new.reach
       and old.leads_only is not distinct from new.leads_only then
      return null;
    end if;
    insert into public.permission_changes
      (changed_by, kind, capability, department_id, user_id, before, after, leads_only_before, leads_only_after)
    values (
      auth.uid(), 'grant',
      coalesce(new.capability, old.capability),
      coalesce(new.department_id, old.department_id), coalesce(new.user_id, old.user_id),
      case when tg_op <> 'INSERT' then old.reach end,
      case when tg_op <> 'DELETE' then new.reach end,
      case when tg_op <> 'INSERT' then old.leads_only end,
      case when tg_op <> 'DELETE' then new.leads_only end
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.log_permission_change() from public, anon, authenticated;

create trigger role_permissions_logged
  after insert or update or delete on public.role_permissions
  for each row execute function public.log_permission_change();

create trigger department_permissions_logged
  after insert or update or delete on public.department_permissions
  for each row execute function public.log_permission_change();

create trigger permission_grants_logged
  after insert or update or delete on public.permission_grants
  for each row execute function public.log_permission_change();

/*
 * The church sets its own permissions: Issues.
 *
 * Marking an issue and deleting one. Who may raise one is still Timings'
 * "Who can raise one", and the raiser can still take back their own until
 * it is marked.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('issue.mark', 'admin', '{none,all}', 'all'),
  ('issue.mark', 'head', '{none,team,all}', 'team'),
  ('issue.mark', 'coordinator', '{none}', 'none'),
  ('issue.mark', 'member', '{none,team,all}', 'none'),
  ('issue.mark', 'newcomer', '{none}', 'none'),
  ('issue.delete', 'admin', '{none,all}', 'all'),
  ('issue.delete', 'head', '{none,team,all}', 'none'),
  ('issue.delete', 'coordinator', '{none}', 'none'),
  ('issue.delete', 'member', '{none,team,all}', 'none'),
  ('issue.delete', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

CREATE OR REPLACE FUNCTION public.mark_issue(issue uuid, outcome text, remarks text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  team uuid;
begin
  select department_id into team from public.service_issues where id = issue;
  if team is null then
    raise exception 'That issue is not there any more.';
  end if;
  if not public.may(auth.uid(), 'issue.mark', team) then
    raise exception 'Marking issues for that team is not open to you.'
      using errcode = '42501';
  end if;
  if outcome is not null and outcome not in ('resolved', 'not_resolved', 'persistent') then
    raise exception 'An issue is resolved, not resolved, or persistent.';
  end if;

  update public.service_issues i
  set outcome = mark_issue.outcome,
      remarks = case when mark_issue.outcome is null then null
                     else nullif(btrim(coalesce(mark_issue.remarks, '')), '') end,
      marked_at = case when mark_issue.outcome is not null then now() end,
      marked_by = case when mark_issue.outcome is not null then auth.uid() end
  where i.id = issue;
end;
$function$;

alter policy service_issues_delete on public.service_issues
  using (public.may(auth.uid(), 'issue.delete', department_id) or ((raised_by = auth.uid()) and (outcome is null)));

notify pgrst, 'reload schema';

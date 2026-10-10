/*
 * The church sets its own permissions: Set lists.
 *
 * Writing and changing a set list. "Their team" is a worship team they are
 * on or lead — set lists belong to the teams that sing them.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('set.edit', 'admin', '{none,all}', 'all'),
  ('set.edit', 'head', '{none,team,all}', 'none'),
  ('set.edit', 'coordinator', '{none}', 'none'),
  ('set.edit', 'member', '{none,team,all}', 'team'),
  ('set.edit', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

CREATE OR REPLACE FUNCTION public.can_edit_set_list(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.may(uid, 'set.edit')
      or exists (
        select 1 from public.departments d
        where d.is_worship and public.may(uid, 'set.edit', d.id)
      );
$function$;

notify pgrst, 'reload schema';

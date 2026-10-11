/*
 * A household says whether it has children.
 *
 * The profile asks "Do you have children?" before offering to add one,
 * and the answer was only ever held on the screen: reload the page and it
 * asked again, and a "No" was never recorded anywhere. So the household
 * keeps it, beside the address, and a linked couple share the answer the
 * way they share the children.
 *
 * Null is "not answered yet", which is not the same as "no".
 */

alter table public.households
  add column if not exists has_children boolean;

create or replace function public.save_household_has_children(p_has boolean)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  hh uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  hh := public.ensure_home(auth.uid());
  update public.households set has_children = p_has, updated_at = now() where id = hh;
end;
$function$;

revoke all on function public.save_household_has_children(boolean) from public, anon;
grant execute on function public.save_household_has_children(boolean) to authenticated;

notify pgrst, 'reload schema';

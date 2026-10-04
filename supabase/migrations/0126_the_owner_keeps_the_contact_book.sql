/*
 * The Owner keeps the contact book.
 *
 * Members' email addresses, phone numbers and marital status, and their
 * visa and DBS records, are the Owner's to see — and each person's own.
 * Until now anybody signed in could read the first three straight from
 * `profiles` (the select policy is "signed in"), and every Admin could
 * read the last two.
 *
 * This migration is the half that is safe to apply before the new app
 * ships: it only adds functions, and narrows profile_sensitive. 0127
 * closes the three columns on `profiles` itself, and must wait until the
 * app that uses these functions is live — the app before it reads those
 * columns directly and would lose its own profile.
 *
 *   my_profile()            your own row, every column.
 *   people_contacts(ids)    email and phone for these people — Owner only.
 *   person_by_email(text)   who has this address, as an id — for an Admin
 *                           or a Head adding somebody to a team by typing
 *                           it. Says nothing back but the id.
 */

create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

create or replace function public.people_contacts(p_ids uuid[] default null)
returns table (id uuid, email text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the Owner sees people''s contact details.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.phone
    from public.profiles p
    where p_ids is null or p.id = any (p_ids);
end;
$$;

revoke all on function public.people_contacts(uuid[]) from public, anon;
grant execute on function public.people_contacts(uuid[]) to authenticated;

create or replace function public.person_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if not (public.is_admin(auth.uid()) or public.is_a_lead(auth.uid())) then
    raise exception 'Only an Admin or a team Head can look somebody up.' using errcode = '42501';
  end if;
  select p.id into found
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email))
  limit 1;
  return found;
end;
$$;

revoke all on function public.person_by_email(text) from public, anon;
grant execute on function public.person_by_email(text) to authenticated;

/*
 * Visa and DBS: yours, or the Owner's. Admins lose them — they were the
 * widest reader of the most personal thing the app holds.
 */
alter policy profile_sensitive_select_self_or_admin on public.profile_sensitive
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));

alter policy profile_sensitive_update_self_or_admin on public.profile_sensitive
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_super_admin(auth.uid()));

alter policy profile_sensitive_admin_insert on public.profile_sensitive
  with check (public.is_super_admin(auth.uid()));

alter policy profile_sensitive_admin_delete on public.profile_sensitive
  using (public.is_super_admin(auth.uid()));

notify pgrst, 'reload schema';

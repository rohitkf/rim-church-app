/*
 * The church sets its own permissions: Giving.
 *
 * Changing the Giving page — its words, bank details, links and QR image.
 * Who can open the page is still the Pages tab's.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('give.edit', 'admin', '{none,all}', 'all'),
  ('give.edit', 'head', '{none,all}', 'none'),
  ('give.edit', 'coordinator', '{none}', 'none'),
  ('give.edit', 'member', '{none,all}', 'none'),
  ('give.edit', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy giving_page_write on public.giving_page
  using (public.may(auth.uid(), 'give.edit'))
  with check (public.may(auth.uid(), 'give.edit'));

alter policy giving_bank_accounts_write on public.giving_bank_accounts
  using (public.may(auth.uid(), 'give.edit'))
  with check (public.may(auth.uid(), 'give.edit'));

alter policy giving_links_write on public.giving_links
  using (public.may(auth.uid(), 'give.edit'))
  with check (public.may(auth.uid(), 'give.edit'));

alter policy giving_insert on storage.objects
  with check ((bucket_id = 'giving') and public.may(auth.uid(), 'give.edit'));

alter policy giving_update on storage.objects
  using ((bucket_id = 'giving') and public.may(auth.uid(), 'give.edit'));

alter policy giving_delete on storage.objects
  using ((bucket_id = 'giving') and public.may(auth.uid(), 'give.edit'));

notify pgrst, 'reload schema';

/*
 * The church sets its own permissions: Inventory.
 *
 * The register: items, shelves and documents; stock movements and checks;
 * asking for something to be bought, and answering. Who can open the
 * register at all is still the Pages tab's.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('inv.items', 'admin', '{none,all}', 'all'),
  ('inv.items', 'head', '{none,team,all}', 'team'),
  ('inv.items', 'coordinator', '{none}', 'none'),
  ('inv.items', 'member', '{none,team,all}', 'none'),
  ('inv.items', 'newcomer', '{none}', 'none'),
  ('inv.stock', 'admin', '{none,all}', 'all'),
  ('inv.stock', 'head', '{none,team,all}', 'team'),
  ('inv.stock', 'coordinator', '{none}', 'none'),
  ('inv.stock', 'member', '{none,team,all}', 'none'),
  ('inv.stock', 'newcomer', '{none}', 'none'),
  ('inv.purchase_ask', 'admin', '{none,all}', 'all'),
  ('inv.purchase_ask', 'head', '{none,team,all}', 'team'),
  ('inv.purchase_ask', 'coordinator', '{none}', 'none'),
  ('inv.purchase_ask', 'member', '{none,team,all}', 'team'),
  ('inv.purchase_ask', 'newcomer', '{none}', 'none'),
  ('inv.purchase_decide', 'admin', '{none,all}', 'all'),
  ('inv.purchase_decide', 'head', '{none,team,all}', 'team'),
  ('inv.purchase_decide', 'coordinator', '{none}', 'none'),
  ('inv.purchase_decide', 'member', '{none,team,all}', 'none'),
  ('inv.purchase_decide', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy inventory_items_write on public.inventory_items
  using (public.may(auth.uid(), 'inv.items', department_id))
  with check (public.may(auth.uid(), 'inv.items', department_id));

alter policy inventory_categories_write on public.inventory_categories
  using (public.may(auth.uid(), 'inv.items', department_id))
  with check (public.may(auth.uid(), 'inv.items', department_id));

alter policy inventory_documents_write on public.inventory_documents
  using (public.may(auth.uid(), 'inv.items', department_id))
  with check (public.may(auth.uid(), 'inv.items', department_id));

-- An item's documents live in a folder named for its team.

alter policy inventory_docs_insert on storage.objects
  with check ((bucket_id = 'inventory-docs') and public.may(auth.uid(), 'inv.items', ((storage.foldername(name))[1])::uuid));

alter policy inventory_docs_delete on storage.objects
  using ((bucket_id = 'inventory-docs') and public.may(auth.uid(), 'inv.items', ((storage.foldername(name))[1])::uuid));

-- Every stock movement function asks this one question.

CREATE OR REPLACE FUNCTION public.inventory_can_manage(item uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.inventory_items i
    where i.id = item
      and public.may(auth.uid(), 'inv.stock', i.department_id)
  );
$function$;

alter policy purchase_requests_insert on public.purchase_requests
  with check ((requested_by = auth.uid()) and (status = 'requested'::text) and public.may(auth.uid(), 'inv.purchase_ask', department_id));

alter policy purchase_requests_update on public.purchase_requests
  using (public.may(auth.uid(), 'inv.purchase_decide', department_id) or ((requested_by = auth.uid()) and (status = 'requested'::text)))
  with check (public.may(auth.uid(), 'inv.purchase_decide', department_id) or ((requested_by = auth.uid()) and (status = 'requested'::text)));

alter policy purchase_requests_delete on public.purchase_requests
  using (public.may(auth.uid(), 'inv.purchase_decide', department_id) or ((requested_by = auth.uid()) and (status = 'requested'::text)));

alter policy purchase_requests_select on public.purchase_requests
  using ((requested_by = auth.uid()) or public.may(auth.uid(), 'inv.purchase_ask', department_id) or public.may(auth.uid(), 'inv.purchase_decide', department_id));

notify pgrst, 'reload schema';

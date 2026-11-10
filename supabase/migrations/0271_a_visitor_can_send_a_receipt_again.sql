/*
 * A visitor can send a receipt again, and see the church's logo.
 *
 * Found in the logs on 10 November 2026: an attendee tried ten times to
 * upload the screenshot of a payment from the ticket page, and storage
 * refused every one with a 403. Nobody without an account had ever got a
 * receipt in — the three in the bucket were all sent while signed in.
 *
 * The receipts rule itself (registration_proofs_insert, 0247) was right.
 * The trouble is its neighbours. Every policy on storage.objects was
 * written for role "public", so Postgres evaluates all of them for a
 * visitor too — and most call may(), registration_can() or
 * can_open_page(), which a visitor (role anon) has not been allowed to
 * execute since the security tidy-up. A policy that cannot be evaluated
 * does not answer "no": it raises "permission denied for function", and
 * the whole statement fails. So for a visitor:
 *
 *   - an insert into any bucket failed  -> no receipt could be uploaded
 *   - a select through the API failed   -> the logo on the public pages
 *                                          (a signed link) did not load
 *
 * The fix is to say who each policy is for. A policy that needs a
 * signed-in person is now "to authenticated", so it is never evaluated
 * for a visitor. The three that are a visitor's stay for everybody:
 *
 *   registration_proofs_insert   a receipt, under a live order's own code
 *   branding_public_select       the church's logo
 *   registration_images_select   an event's picture
 *
 * Nothing changes for anybody signed in: role authenticated still has
 * every policy it had. Written as a loop over the catalog so a policy
 * added later under role "public" is not missed if this is re-run.
 */

do $fix$
declare
  p record;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles = '{public}'
      and policyname not in ('registration_proofs_insert', 'branding_public_select', 'registration_images_select')
  loop
    execute format('alter policy %I on storage.objects to authenticated', p.policyname);
  end loop;
end
$fix$;

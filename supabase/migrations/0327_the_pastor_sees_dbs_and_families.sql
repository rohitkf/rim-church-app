/*
 * DBS and families are the Owner's and the Pastor's.
 *
 * Two pages went in the same day: DBS Checks (0324), opened by
 * `people.compliance`, and Families (0326), opened by `people.family`.
 * Out of the box the first was the Owner's alone and the second the
 * Owner's and every Admin's, because linking families had been asked for
 * as something Admins do (0319).
 *
 * The Owner, on seeing the pages (November 2026): "I hope only owner has
 * access to this", then "As well as pastor. The rest of the access can be
 * controlled later in settings."
 *
 * So, out of the box:
 *
 *   people.compliance   the Owner and a Pastor. Nobody else, as before.
 *   people.family       the Owner and a Pastor. An Admin no longer starts
 *                       with it: the cell is still theirs to be given, in
 *                       Settings, like every other.
 *
 * **Only the starting point moves.** These are the catalog's defaults:
 * what a role has until the church says otherwise. A cell the church has
 * already set (`role_permissions`) and a grant to a person or a team by
 * name are untouched, and every cell here stays a choice. At the time of
 * writing the church had set neither row for anybody, and had one Admin,
 * who is the Owner: nobody loses anything they were using.
 *
 * **What comes with each is what it always was.** `people.compliance` is
 * everybody's visa and DBS details together (0126, 0277): a Pastor now
 * reads both, marks a DBS verified, and cannot mark their own (0325 is
 * the Owner's alone). `people.family` is the Families page and the Family
 * button on Volunteers, and linking a family for them; linking oneself is
 * still refused without `people.contacts` (0319).
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.compliance', 'pastor', '{none,all}', 'all'),
  ('people.family', 'pastor', '{none,all}', 'all'),
  ('people.family', 'admin', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;
select public.migration_done(327, '0327_the_pastor_sees_dbs_and_families', '76c432b380649f9c8ef974d4f8879e8c6c0e73cf14cf0325a8ef464e38da4ae0');

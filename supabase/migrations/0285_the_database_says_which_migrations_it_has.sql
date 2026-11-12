/*
 * The database says which migrations it has.
 *
 * The repository held 284 migration files. Production's own ledger
 * (supabase_migrations.schema_migrations, the platform's) had 163 rows,
 * began at 0154 and mixed two ways of numbering, because migrations here
 * are sent through the Management API after a local run and a dry run,
 * not by the tool that keeps that table. So nothing said "0277 is
 * applied" but the objects themselves (the system-design review, November
 * 2026). And nothing enforced the rule the house runs on — a migration
 * first, then the app that needs it — though the other order has already
 * shipped a page that said "Could not find the table" to every phone.
 *
 *   schema_migrations   one row a migration: its number, its name, the
 *                       checksum of the file that was applied, and when.
 *                       The app's own, not the platform's.
 *   migration_done()    writes that row. Every migration from this one on
 *                       ends with a call to it, so the row is written in
 *                       the same transaction as the change wherever the
 *                       file is run — CI, a laptop, production — with no
 *                       tool to remember. The checksum in the call is of
 *                       everything above it in the file
 *                       (scripts/migration-ledger.mjs works it out; a test
 *                       holds every file to it), which also makes a
 *                       shipped file that has been edited fail the build.
 *   schema_version()    the one number: the highest N for which 1..N are
 *                       all recorded. A gap stops the count, because a
 *                       database missing 0290 is not "at 0291".
 *   health()            now carries that number too. The app is built
 *                       knowing the number it needs
 *                       (frontend/src/lib/schemaNeeds.ts) and, when the
 *                       database is behind it, says "being updated"
 *                       instead of breaking; CI asks production the same
 *                       question before a release may merge.
 *   schema_ledger()     the rows, for the weekly check that production
 *                       has the migrations the repository says it has
 *                       (.github/workflows/database-drift.yml). Open to a
 *                       visitor: every word of it is already public, in
 *                       the repository.
 *
 * The 284 before this one are recorded here, after the fact, with the
 * checksum of each file as it stands; when each was really applied is not
 * known, and is left blank.
 */

create table public.schema_migrations (
  version integer primary key check (version > 0),
  -- The file's name, without .sql.
  name text not null,
  -- SHA-256 of what was applied. For a migration that records itself: of
  -- everything above its last line.
  checksum text check (checksum is null or checksum ~ '^[0-9a-f]{64}$'),
  -- Null: recorded after the fact, by 0285; when it was applied is not known.
  applied_at timestamptz
);

comment on table public.schema_migrations is
  'Which migrations this database has (0285): written by migration_done() at the end of each, read through schema_version() and schema_ledger().';

-- Nobody reads or writes it directly: the three functions are the way in.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

/*
 * Record a migration. Run again for the same number (a file applied
 * twice), it keeps the first time and takes the newer name and checksum.
 */
create or replace function public.migration_done(p_version integer, p_name text, p_checksum text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.schema_migrations (version, name, checksum, applied_at)
  values (p_version, p_name, p_checksum, now())
  on conflict (version) do update
    set name = excluded.name,
        checksum = coalesce(excluded.checksum, public.schema_migrations.checksum);
$$;

comment on function public.migration_done(integer, text, text) is
  'Record that a migration has been applied; the last line of every migration from 0285 on.';

-- Whoever runs migrations, and nobody at a browser.
revoke all on function public.migration_done(integer, text, text) from public, anon, authenticated;

-- The 284 that came before, as the files stand today.
insert into public.schema_migrations (version, name, checksum) values
  (1, '0001_extensions_and_roles', 'e66eb079215136311cdcc8c33ce92d33ebc8e4f4a6d44f6692ad2d7d25ccaee0'),
  (2, '0002_profiles', '6bc4b1f2346d44855e0d09b53e4ab6a221bb08d80ffde4e6247252028c537fe2'),
  (3, '0003_departments', '55539f1bc3f0defc8491336f6f4991d17b30b2d3f2b1df296b3678f4db3ecd53'),
  (4, '0004_services', 'a9d0689a01d04fbb1a3cc1c958a9837c3656cbc3833c6963daecac8c1615b0dd'),
  (5, '0005_checklists_attendance', 'f6607393564adfd2351cc2a49f7f99503762e2d41c37d5fb4ac1c4492635574a'),
  (6, '0006_inventory', '80d53b176e1b82c0a96296fab24dd0763a25781e0fc3798b128974759115f8a2'),
  (7, '0007_messages_notifications', '5daea87630a664608350e3c15ac891291190a98aa54d28c1dbf13afb0d40eaf3'),
  (8, '0008_storage_handbooks', 'c52866a34df707f4fb8b4f6e4fa998d5204f7927f124f20c4645b4512024655a'),
  (9, '0009_realtime', 'be7937909dd5f69fef9426a2ecc4db3c3ac4545f32383707cf41a0af55741b86'),
  (10, '0010_message_board_weekly_clear', '2be493e5a0a0275a7d9c33906f73841b14c4bb57b97afdc294cbbbc538d30af5'),
  (11, '0011_department_colors_message_badges', '87524f5ab3556a869d0500931d50ba56a94b30e01944af09fe6dafca7f072622'),
  (12, '0012_service_templates', '37de74f57194a886f57f781843963fc83ec1b853c34b0ef01d4e45494eaa034e'),
  (13, '0013_fix_session_chain_recursion', '5b7f92c76e57f0c361c4e4dbbe68bf3ac91162163eee893b237f1cc1e38361a9'),
  (14, '0014_availability', '587eb21c6cd7f83f6a5cdac56db41ee219bb0a38cfd0d6c35ed9cf8bba7de35d'),
  (15, '0015_team_rota', 'f365e5d3af78cc3fa16d73acd0a5993ade753fc130c11bde164515cfeff22cf8'),
  (16, '0016_department_roles', '33650b0a956c84d9429142a277acc875d3a33b58e96d556aa01b8adef97e6481'),
  (17, '0017_attendance_from_availability', 'ae1ada5ed0b1dd754b5e9e3c3463a468e6f05d09efd2ae18d50362be34763974'),
  (18, '0018_roles_and_permissions', 'a942052e088bbfd2b93f6d274c7a19a6cd3c3c0761acdaf5ae4e657e84f6b184'),
  (19, '0019_role_checklists', 'c5bdba5371454041db44ceffe9a831e5901515e693b5e86d1d064dd0e47d6d26'),
  (20, '0020_admin_delete_user', 'b1c59c04fda98c5072c6d7fe45df1b104d75420bd30e0724f65440976c4d3547'),
  (21, '0021_admin_reset_data', '1a988032558bd826fc985712537fefeede2e5b157ca33f1271d7b47a15329657'),
  (22, '0022_message_board_moderation', '893ae1bfa471e5ebcab8206ebc832f72486697b22e9f96dcc118707479d3d662'),
  (23, '0023_service_flow_is_a_team', '51bf8d073bdc9aaee1e7cec109e0c81b5c5843fe2553f621dc91800d579d0405'),
  (24, '0024_fix_checklist_upsert_guard', '1820b3e5e5e972253b3e2b20b3cd5fd8ec886809739609786f015c84e9f29312'),
  (25, '0025_checklist_stage_undo', '279fd2de614e9119d4dbbb31df5759f5d50a8bff8df96c072d92625005911de3'),
  (26, '0026_sign_off_team_sees_all_checklists', '1128b83dce1073ac14ab739e916218f95631f0b50b431c4d688f6399880037c6'),
  (27, '0027_sign_off_team_can_sign', 'ac4a7cfafdebfefdcfa942bbba2ca5f2754e48bd86cbc7e921ab17fa87112c30'),
  (28, '0028_admin_posts_as_admin', '7b55cc3193e403418e5160d26d9eaca3b19193439b230916d18c12fd0a426d58'),
  (29, '0029_anniversaries', 'c4ec84818fc0b7cd85b483712b8f8b9be2f5598548d07d97aaf5bcc9df06e944'),
  (30, '0030_handbook_uploads', '50aacdd28e2555e76ac994c69eac68f2d71644de643dbf51a14cfd3b85b38ac3'),
  (31, '0031_inventory_tracking', '17d47f8e8e0a045a505abea5e9f44e35ece2396314c35ac50c6fa6d3628cd13c'),
  (32, '0032_inventory_value_and_access', 'd66654b974ebc789a3d8d55dd6e22f288f846297c38e3827c0e1b5ec65c3b863'),
  (33, '0033_ownership', '24644cd01d954a6233ca40f9b64e1390891ac305e35e22ae895bc255c3879e03'),
  (34, '0034_qualify_remaining_writes', '76cf1c404f51f0911157ab385b3a9306e044baf563b9d65c20cc0f464e085eba'),
  (35, '0035_owner_is_always_admin', '49a3ac86d687297b99b2425cc711746099ec480ea551d95a905aff86d879ddde'),
  (36, '0036_inventory_visible_to_all', '6ea0d84d256e396faaeef111dad21feef0731caa9b49567de20e7434815391a0'),
  (37, '0037_reset_is_owners_only', 'd56661f4c43c1176ed64988cce805d5dccf32b87d8123b2975e42d7cda089cd8'),
  (38, '0038_team_join_requests', 'ea1f1422c31c6ce61cb6c9ceb73bec4269d3431f2f721045863ae0be4f758f15'),
  (39, '0039_push_subscriptions', 'a7fc15bf1110bf7057b49e47ab65fe5b1cf1af770d5593959cfe4423bea4425d'),
  (40, '0040_alerts_and_reminders', '99bacf118c317865ad241bac9b756aad03e89f19a497c9c9b8295675ec1e448c'),
  (41, '0041_activity_feed', '5377fc207572b4933b461fc3a80be6b9d967313090c0a633e7b40c2d7a5738a4'),
  (42, '0042_checklist_activity_direction', 'c2247811fb9b6318404da58268682e9deb8bb5ec91b5b946baa4bf1d20d43fd4'),
  (43, '0043_pin_function_search_paths', '4f98fde0b93463f3b980ea91cf2b29467cb3c6fba0163a2bec97ae5552af92f6'),
  (44, '0044_team_board_and_mentions', 'c484df39079c25a7f058c7d5bca1220f741bdc5b96b8d94c6766c0926d21b79d'),
  (45, '0045_service_guests', '50450077541768d38290b35e275f8d64c89a519aa8d8f8df187aaeb2f652cc91'),
  (46, '0046_finished_services_are_read_only', '448d61ea3acb90a673ad7929d6153070a74e44e8b3be86a624f7e8b8f5b8bacd'),
  (47, '0047_finished_services_lock_checklists_and_availability', 'f474864d62cb36a477f3d82af135e6c2424d6bd437cd685487dadf0985ff6fa6'),
  (48, '0048_finished_services_lock_the_rota', '5f0443deada8580ae5df1b5e6c0dc332fd688d5d26869a12e475e454961ba4af'),
  (49, '0049_join_requests_always_reach_someone', '3a705376fb5128beb09634282b7f93e7a668d04beb83c92f131be357c35e1a09'),
  (50, '0050_assisting_head_is_a_full_deputy', 'f93dee27976e0e09ecfbf33980919c382a4f63a4ab793a011c634c6879c801d8'),
  (51, '0051_every_team_has_a_coordinator', '0b9ba7a36f1d8e0583c3aac427cca9e421791acea12d3d6108b1ab0c801f1c10'),
  (52, '0052_coordinator_is_exempt_from_one_role_per_service', 'ef1764d7f6e907ea86b53820834b18e3f3e441a6d3d4a63fea059829e5401909'),
  (53, '0053_team_polls', '55440b9e602796e6cd97f993e237d70cfa17f6e9ff81f42e2998900fa9b22f28'),
  (54, '0054_inventory_brand', '6263d5e9f72dcd17ae541564c74f6d65c02840f1b4e45ef4d1dd37593d99750d'),
  (55, '0055_sessions_can_be_skipped', 'cd0cdd9099039bb446b908d5d7b1016a7eb2106cca2f8fdf2769b8b063e0f68d'),
  (56, '0056_a_service_can_be_ended', 'e633244c04e1c296d23e979ae3eeef83b5f80f8d48ecc4c97c07b7942e606415'),
  (57, '0057_time_granted_and_held_sessions', '0e55dbe3cb9f4a5f84bf433dd212a662bd76fddcf039556d2b3fd92233c89769'),
  (58, '0058_an_hour_to_put_it_right', '294fefb0d7cf4b70435e6ca36dc5c4a2308c21b54ce109c5c145d8039ac4e76e'),
  (59, '0059_time_granted_is_kept_beside_the_plan', '7e62a802d0b4baff9cf3cefe1e3aa8f57d9a402d291cf01704ab4f2732c2b291'),
  (60, '0060_put_them_in_the_order_you_want', '555af7c7ff2e4824d1ec7bf29c8f4a4bac5aaf81a3cc73627ad65a4f3d89e7f3'),
  (61, '0061_the_church_sets_its_own_clocks', '79f5e2c7b0b837456c5b00997f2080011813bdcd4269464c84e29415c7014db6'),
  (62, '0062_before_and_after_and_second_thoughts', '7b4ee1e7956e4ce0570fd0f51727fb3721cf19c1247aea10911b427c61d2cb8b'),
  (63, '0063_a_deleted_message_has_no_body', 'cee925f7ea0b6fd6d1fa43fad99c5a9c265097fe45c250d6f6fd673226097cb1'),
  (64, '0064_a_calendar_of_our_own_and_an_open_door', 'c988ca85bcf5c0217c5bd7c60d509f3350e3fe77af793aeb23d5da93619dfa37'),
  (65, '0065_where_it_came_from_and_what_we_still_need', '8cd18664061663586c484fe0b4cf2e6163db160cbcb0c06f47afec0d27c7a23a'),
  (66, '0066_a_poll_that_nobody_sees_asks_nothing', 'd5b1b9a711338d2024f861692ce9a9307b7aea6e50e75a63b88e64b246c42fa3'),
  (67, '0067_ten_screws_at_a_pound_each', 'cb3b7f7e7f86366d9c30f48f95a623fb9bf1f2a636584a324d3f4c27c40f043b'),
  (68, '0068_an_invitation_is_accepted_when_somebody_walks_in', '4fa427ccaa2c73573e12765a2a98e92513136327bd5f784d7417ade32af4c072'),
  (69, '0069_a_device_belongs_to_whoever_is_signed_in_on_it', '067ec505b945afd192e289771f1592457718280b5f640dcc8da4fcfb9ca6b60c'),
  (70, '0070_a_removed_account_stops_working_at_once', '4ad7863494823ccec4af9f041b22f0946c262a10c686666b987cd0bbe7f5a31b'),
  (71, '0071_roles_that_come_in_families', 'c2513bf9f6363ed001eb519b7b5f5739cc1500d1d9f11483f9254dcda55d5427'),
  (72, '0072_a_role_can_belong_to_more_than_one_family', '1aeb67c80bdc5b4b684551725491e4fc5828f7b66bd2ab00cae4269e5b0bf3f3'),
  (73, '0073_one_group_per_role_after_all', '0048873aa4b5998cfac27e6126e959ae3b26c2348eb32113bfc7c0b37565ce45'),
  (74, '0074_the_songs_we_sang', '07b57e214a5c84fe9d40c1449c4872b609711dd710f6594f679b4a1db2de0123'),
  (75, '0075_an_alert_for_whoever_needs_it', '20edbf32adbca2ed2be30ba96c1dab3e5e1c2772d425f6e1fce1df5bf60ad685'),
  (76, '0076_a_call_time_belongs_to_the_day', '098ab0b1225458862a31d946238639f27efcec800a005f8ff96abf6d0f0b0be0'),
  (77, '0077_inventory_has_shelves', '3b9b477cc651a281e8ef7a394f0b7ec70430266e9c1ebef13c442c1b98e59685'),
  (78, '0078_a_request_says_everything_the_shelf_needs', 'a4830bdc95f3e49b6c79f456d4fd0a0a44227c80c949a9fc4d244c32cb74f483'),
  (79, '0079_a_checklist_opens_at_the_call_time', '173d2d60751b0d2caa8da26827b47426d0fbe47915b211585b442325b72e2846'),
  (80, '0080_nothing_to_see_until_you_are_on_a_team', '05a8b609f3a1f7b93beee613f14d1ce24f02574fd741b2707debc2e98c967a1c'),
  (81, '0081_the_first_time_somebody_opens_it', 'd64a031c794cce42a1989eed836a6f763eb58815ded0719aef6935d158cdd356'),
  (82, '0082_the_rota_is_the_teams_too', '008396ae5da8cc2ed968382cf4d7757427af8e38dac2bbedd3a96b2bc5513573'),
  (83, '0083_a_team_can_see_who_leads_it', '848ae0a76a9c011b53175dede7c42acb05ca799f525e9f4e97b01e1b50711c64'),
  (84, '0084_the_exemption_was_left_behind_by_a_rename', '7e8a6de37d390a25ae5ff776850a3d8de393e11308d8630ce8112d5dbaf1a768'),
  (85, '0085_the_feed_cannot_log_a_service_that_is_gone', '74dd98a70dab569da07be27db1f3d627c7697ecea47b76c05ca2ccb3721679aa'),
  (86, '0086_the_team_on_the_invitation_was_only_a_label', 'df2fe3d544e5c5ef51c870e078460a9ab20b1c755b8f112530a0aa7194e58278'),
  (87, '0087_the_database_says_when_something_changed', 'fe3ad1c5b6cc26e06e8f819e313130a0097542626a02ec29d87f7d4d137a95a2'),
  (88, '0088_an_answer_is_due_before_the_service_starts', '19745dbf5d1d6a72647bb0db0fa1d254b4e8421a5737e74c9f3cadcedaa9680a'),
  (89, '0089_the_mark_at_the_top_belongs_to_the_owner', 'e654848afe70b6a7fed1d5f93871b612e88e52b00d29473f210c2e74f9c46791'),
  (90, '0090_thirty_megabytes_of_logo', 'cb14ac3632f8563a6e059631930484a77c2d1189f617a00fe52e82f0ca95fb3d'),
  (91, '0091_a_guest_is_a_person_not_a_line_on_one_service', 'b4ad5753a5caa08a4ff751bc9bfa469ef899ab191a19b84f00df1bac23b5242f'),
  (92, '0092_answers_are_due_the_night_before', '1dcb756dd4c23674d1470c7970d5314a623a21e8c315d5418daf6e2d940e6b85'),
  (93, '0093_a_session_can_be_taken_by_more_than_one_person', 'c7f15ca5629b60f5c5b33f66bc37b5a296d36140042fe861865ddbf08388bbf8'),
  (94, '0094_a_session_no_longer_has_one_lead', 'd521fa99149476827235e444099be04c6620c28175fc038b2f3b5e8ad66a4972'),
  (95, '0095_a_late_answer_is_asked_for_not_taken', '50abdf58b800a29c1217bf3adc7e6208daa600aa0e375457d58b7d75d79fd140'),
  (96, '0096_an_event_can_run_for_more_than_a_day', '3ce258cc1048fd0cd877ce5d98bc5573ad08ae3012290de521f09edc2bb75a08'),
  (97, '0097_a_new_member_is_asked_who_they_are', '7fedbb96ea0e244460baa68669119dfd3fed9453df5fa25be701c874d9081e33'),
  (98, '0098_an_invitation_says_core_or_guest', 'aa0858386737db8fa5ac54d2a202939214b83b4cce22883cf0ffcafc3b3bc08d'),
  (99, '0099_what_was_said_after_the_service', '772cbbc0939bc6facfe8d7651ff95bdf6111525c9d48aaf0fc79a69b8aded96e'),
  (100, '0100_the_feed_misses_nothing_and_names_who_did_it', '35cc64e99766ebe837b2ac27f9754b0544f3362754da08cd3c25d58f75c6709a'),
  (101, '0101_starting_a_checklist_is_an_event_too', '7c7564444fdce13987449f27ea107e0af7d7637a328cb3a444ce80071affce2d'),
  (102, '0102_a_debrief_is_a_list_of_things_not_a_paragraph', 'fefa2de2300e7eaecf234193489a06ebec49121382b8e1e4bf1a9b4b819c0ba7'),
  (103, '0103_an_answer_can_say_more_than_yes', '7bc7982b12072f0328a3154bb31d7cbaf7e1aff647a18079a127a14fca5931e7'),
  (104, '0104_the_media_teams_checklist_moves_in', 'ea2a1880246321acc9e259cd662e1d48ae1df7d67c9f389623f389e1e314630e'),
  (105, '0105_a_service_can_come_round_again', '8ca4704bd35675ac1edb8d7703cb6a0e0808fa8d8d8bf325da41b3921d3d0f12'),
  (106, '0106_someone_can_shadow_a_role', '5b73e5dc1c86312ff327678390091a399d4f4ed6206f2bd839154c5b981f3d23'),
  (107, '0107_the_rota_has_tags_a_church_chooses', 'ea157772326f255e14afbd7c8a60e75e1d46ea6e5636831e84124efe4346719f'),
  (108, '0108_tithes_and_offerings', 'd4357bf0c87f93732b5aab2526af81db22914f0d71b1a8bf18dee57d490584e1'),
  (109, '0109_a_church_member_reads_what_a_church_member_sees', '332880ac8a200f046cd921bcfc7fc991756423f9752e0d7c6ba59d2078fe9aea'),
  (110, '0110_a_team_says_it_is_ready', '6eddc81f4e52d86d7f90502912a2c825940d82db42603a17e49adf758460868b'),
  (111, '0111_a_song_has_a_key', '70e06d91d908b4ba24f7e8317b280df2b14c2d8537b4b15fa0fb4f43006c53d8'),
  (112, '0112_a_role_can_be_before_or_after', '860d7fb36520b5be20486595755b18a365eeaf8ee6ce4a88e4c2c268479898a9'),
  (113, '0113_church_updates', 'f9e9c0c9d33141e24724faf90b2da1266dca37a9a749db2f0abb0fa9169594c0'),
  (114, '0114_a_poll_for_whoever_it_is_for', '1d8d7c1eee9c2c2fa89450700d1d71aa450e2e3abd3cba541ae4dde245b85d43'),
  (115, '0115_the_packing_up_list_stays_open', '574b606d6e48faeb43399f13230d3f3b9aad602437d56941338742c76c676ab8'),
  (116, '0116_activity_clears_with_the_board', '82ad020b96196e7bb9aed446d90b9bf27c7761999d9bccb7f01f7d807bd20c46'),
  (117, '0117_issues_raised_at_a_service', '13871d2d9492bcd9e6220696f50422de34f99ec0069d723477ec2ef09541ae4e'),
  (118, '0118_issues_belong_to_a_service_window', '4cf20c1027859ab2e6e40378204ef3d9823771975e579855949f6521f88bf76f'),
  (119, '0119_heads_and_admins_raise_issues_any_time', '4c19620725e7818f6b024024adb615e1133f980989b9a5dce10207a64380f716'),
  (120, '0120_a_team_writes_its_own_debrief_after_the_service', '9bbf415eb50216153090de8ac3e97a8caaf02d7d41ffd2f1aafb291707a4e253'),
  (121, '0121_the_church_arranges_its_own_menu', 'bd939fe4dc8aa2b9b709eadf3cc20b75b88794ecd07185e412d0770ea34be003'),
  (122, '0122_ready_for_service_opens_at_the_call_time', 'd9f39ffea747e4335fc4dc2f8f9ce39464146204e794313bca1b0755fa25adbd'),
  (123, '0123_the_church_decides_who_sees_what_and_for_how_long', '0352c3e7e9b3c57c6d91079fb65a5232af079ccc88564084d10cf091870253c8'),
  (124, '0124_the_teams_tell_us_what_to_fix', '84b051bc67ac1ae5af1416c7dfd9e56106a927f726ba72561237e5754160b1c9'),
  (125, '0125_only_the_owner_reads_the_feedback', 'ff6e77e05ed6d3b69acbb23d411144e809402998d1ffc8b668d444b1aaeb30a2'),
  (126, '0126_the_owner_keeps_the_contact_book', '3967ee854dcbcbf01fc8e100c785fc48e871b63f2543a1b6d0420a459881f64c'),
  (127, '0127_contact_details_close_to_everyone_but_the_owner', '0b2311079b6e6aeb24202a83429d45e5ded4c89e7ab3832f5295ceab481edcb3'),
  (128, '0128_everything_has_a_clock', 'c60038c78dd32c13a0bbe8b763b44d8082a36009064297452b212e5c13a1ef69'),
  (129, '0129_timed_posts_expire_on_the_hour', 'e7117b32b7fd302b598810f28288e981056596cc4660d368b44e7ebda0ebb00c'),
  (130, '0130_sent_alerts_clear_on_their_day', '717f06e09493bd2599f15028c4883e833a338c8ddb5a27ef94ee1458be20ab0c'),
  (131, '0131_services_go_after_two_weeks', '6c72cc53ddb8bfa3f025fe47c936e412a89d248c36ca2e0612fd517ff9ce8b0e'),
  (132, '0132_supabase_logs_and_upload_limits', '1a4a146347829991114a35e1f6176e17c4093f2ed49bed90328c74e52c2d2ee2'),
  (133, '0133_the_church_writes_its_own_permissions', '2d1a8f4ba077b65a2aa5ff98ffb09e569fe84d253fff84a81c31269b6ce436c5'),
  (134, '0134_services_and_planning_reads_the_grid', 'f5a6af6aa4863e68a3674a855fa1dcdab1564336c383b9d711b2e3ca251316ee'),
  (135, '0135_teams_and_roles_reads_the_grid', '3976002295d908d6dce7285347137d6c431479c045847aa0eec38f9cafd96bfb'),
  (136, '0136_on_the_day_reads_the_grid', 'd915453793276eec0d35c3639aaf8f5feb5bb322121fc673010abc6071dd1507'),
  (137, '0137_availability_reads_the_grid', 'ab16c289d032efb03709ac62e5596f066400242ae4d4c90d98b9c4e6135c5dd1'),
  (138, '0138_inventory_reads_the_grid', '0893968145b9d32e073b4f56dc661dcdffb28de05946893315f0ed63aed91c72'),
  (139, '0139_messages_polls_and_updates_reads_the_grid', '63808c8c0c959cdafc74fe8bd0f7c74de3fcfff303cf0e0ff77d5f8fe028110e'),
  (140, '0140_issues_reads_the_grid', '7826c8fbd676b57613e21235e222d9140b3339c72562df246cb421ad0694c141'),
  (141, '0141_set_lists_reads_the_grid', '53d4934fed0f74e65cb70b83af754a17c608445e8d69056bc5650c7ecf403a7d'),
  (142, '0142_after_the_service_reads_the_grid', 'b005c0030bada0cb22329c1a27780368189205bf7f8adce3f47cfab0f9898db7'),
  (143, '0143_giving_reads_the_grid', 'b8eeb55b192a4d4870a08d4d219b01c23db2d69abcc6c326367dd39a42c235fb'),
  (144, '0144_people_reads_the_grid', 'b55e53a81f277bfe1eb1e085b5039f791e89b2dd415c5c16b188ac1945656306'),
  (145, '0145_availability_keeps_a_log_of_every_answer', '5fd99a77311df2037054b96b4e143ddfe7d020f845fd7acc8bba97da44a9bae9'),
  (146, '0146_a_heads_yes_can_change_an_answer', '524270da32c9fd1f88b6bd730aa566ed1e5736c79a60fab3a8015a9ab0dda35c'),
  (147, '0147_the_packing_up_list_opens_near_the_end', '128ffed8ffc63366b346357de33929f0040c0093d00306c335b55da9659289de'),
  (148, '0148_a_visa_can_carry_a_note', 'dc36a2027fbfd0e88b193ad5260296ea623d0a9cb6b2658404f069f28e990839'),
  (149, '0149_a_family_is_a_household', '48b745dbfaadce8f4c6f7224f015e5d90acaeab10ba104d1a1fb2b16f0367734'),
  (150, '0150_a_household_says_whether_it_has_children', 'b1cd5705636798755565fe76d9ea5fd76e0428ebada1e37112ac56cd54db44d0'),
  (151, '0151_helpers_the_app_never_calls_are_not_callable', '8e81009dacc7826ac7df397b25910e291f276ea55072f00319cb61aac37c249a'),
  (152, '0152_a_couple_shares_one_anniversary', '625c7dc7171bd21df8d4d2e894dd288fd0219a710a677e15c155cd836157e23c'),
  (153, '0153_a_tour_of_the_app', '868c304832e15bd665a945246fd86664ff27987d35433c3c8cb0c745b93440f5'),
  (154, '0154_phone_numbers_carry_their_country', '8dacf03bae698618810eac787e6bc1511c7708358db9c75fd99c272725f8139d'),
  (155, '0155_the_stage_is_laid_out_before_sunday', '274537c6abd954e6abacd72673d171a2785ef4dfd979fcbc94cf3463542aa176'),
  (156, '0156_a_layout_for_each_area_and_a_word_about_each_release', '27848c314e87dc2bdb6844541e94b0f0311a91e545e00ae8fcca9b6390f680cb'),
  (157, '0157_a_locked_block_moves_only_by_leave', 'bca5b35db7c9e06481cf196b97ea5fb840f51daae4a1662181ef9e85fb90bf43'),
  (158, '0158_one_workspace_for_the_whole_service', 'be7e392ed5af858946d1141a848371dfa77b24d9bd5bc676c02da3ced9094877'),
  (159, '0159_a_locked_block_is_nobodys_to_change', '8961037554ec41b1e11716cea3c563354f94b49088ed1ecd0bd6c79c6d06d702'),
  (160, '0160_a_block_can_be_a_thing_and_its_corners_are_its_own', 'ff02f8141e59ccdc3902767f0a6eb2626f5cfd6d8b318b3c9062473ab42e32eb'),
  (161, '0161_a_team_can_list_somebody_with_no_account', 'e40028e0b16860120b4a05f5de72f5e10295b9013c73070696f70830761296a7'),
  (162, '0162_a_teams_own_rules_and_the_assisting_heads_own_column', 'c5e9109258c37ed8de620da3bc4890aef0db05314db153b78862af510b1e1519'),
  (163, '0163_whoever_may_change_an_answer_may_change_it', 'f3e7cb1582c664af1fd38b845c00710a6d44b44ef00d663fe03c9d8620ee9b1b'),
  (164, '0164_the_checklist_and_purchase_guards_ask_the_grid', '87469836b4f24cd837c0fc540ab08f652b4aca559e10660b58ca64addf94a97f'),
  (165, '0165_the_feed_says_why_somebody_came_off_the_rota', '0cccbe73299a064c74987871f79b5533950875c8045c46faae28851dd94f4995'),
  (166, '0166_a_guest_on_a_team_has_an_answer_too', '33caa81bfda082e4836c1db91cab1f3ae315ca5448cde267c5a015a45df629d0'),
  (167, '0167_a_guest_on_a_team_can_be_on_the_rota', 'cf984b4e38b11bbe922a5a905aa28bae5fa3873de14aeebc0a478b5b63ecf4e0'),
  (168, '0168_the_newest_tables_are_live_too', 'e2957488cac5a98f3e8bf69798a4ef6ec758e5f0a462a8d6b18f75ded660b849'),
  (169, '0169_an_address_belongs_to_the_account', '9e4035ae8fc048388844517a06f163dea3b174400528e45c1f05e258558175d3'),
  (170, '0170_a_prompt_nobody_read_is_not_old_news', '8eae0ac42600c36e6da9e82078c3d8c95eca45f3dd75b50856a4cdc30d2b9d62'),
  (171, '0171_a_row_belongs_to_the_team_it_names', '01af15716247197258d8b3e9064130a30a9df3c1b96025afb2593243ddd7cab1'),
  (172, '0172_a_poll_can_keep_its_voters_to_itself', '46cde44dcdea383289ca636159fa686ac8ac394e9dc06259f3d06563d5beaca5'),
  (173, '0173_an_unread_bell_still_has_a_ceiling', 'bde63239a2d36d946929929e64db34fb81c35311352213c364f2f2313ff1f59b'),
  (174, '0174_the_audits_rules_hold_for_every_row', '146423b24412dbc5ed0c9309637218a6b1ed4dbdb2b60dc558eccc3794062bd4'),
  (175, '0175_the_databases_own_helpers_are_not_the_apps', '5902ea340154bee7a51ebfbc31941e933d3d51c4970999ce1834f48d1fddf665'),
  (176, '0176_an_alert_reaches_the_team_and_a_head_marks_who_came', '528625f2d12faeb18b8d339ab3e8c4d8dc3ca438d5bcc93c6746f159c9374706'),
  (177, '0177_a_poll_is_its_askers_and_guests_are_asked_by_name', '41f1093a430d71a1a28387306e2c4fdb5b6ea27bb838dfa71b2ddde9e2a79188'),
  (178, '0178_what_is_waiting_on_me', '785188609d9a25049084f8908024c161b7b4ceeb2aa61728124773c5f7c38841'),
  (179, '0179_a_teams_head_manages_its_polls', '2f42b08e85a113ebf9a3595dfcefb41b02d8ec2effe6e372f0551f8c4c77fb25'),
  (180, '0180_who_sees_the_voters_asks_the_new_rule', 'c994dab51b83e5e33e5a4643cb4e473bc846c6cd943725206e4492daca53fcc9'),
  (181, '0181_the_church_sets_how_polls_are_run', '42abed79f2a7ba518c7afa39eda906fb6b4da89bf87677f345978808bbc81dc2'),
  (182, '0182_a_session_can_have_a_substitute', '6cef0726cf856348c3e8b04e9ac67152c3b78e4494d3d1697e51566b8e28957a'),
  (183, '0183_can_you_serve_waits_for_todays_services', 'e3c0205f73ffbdb98a336b0030a904dc31d70a446716fd6130e5fb5b774ef67c'),
  (184, '0184_the_planners_buttons_given_to_a_team_or_a_person', 'dd72cebc606ae789ca9d8ad13481a0d482c53a16c01c45c576e3cc6b73777f62'),
  (185, '0185_board_posts_and_team_chat_reach_the_phone', 'f9ef6ab54f032591a90a875acfe9bbfa16c275f2e52efe8e3cc00875a49ca5bc'),
  (186, '0186_overwatch_is_a_role', '67c66e23519eee77558ad087a94695b1132a34886bf5bda7be7d7d437a37296b'),
  (187, '0187_overwatch_sees_everything_and_changes_almost_nothing', '5abb1f85569396b03cd1875c2d1ccb1857d88607df5c0e90458751978d5b4390'),
  (188, '0188_a_board_post_says_who_it_was_made_as', '40abd479df9b471c9cbc0ee8036a66b5c81293dcd2a4602f953df9fdbd96950c'),
  (189, '0189_nobody_lets_themselves_into_a_team', '675efd5115ecfcc2e71917f6b1b42b62b72bc76611efc236dd5cb3ae752306fc'),
  (190, '0190_who_may_ask_to_join_a_team', '1f54fa9efa33b04507c004e2474f01963c23b04d2164d8a8126472038ec5cc73'),
  (191, '0191_where_the_church_is_and_who_clocks_in', 'bd905693b8de758a794a55597002c0f7880a9085683cf54c9516f398b79daca3'),
  (192, '0192_clocking_in_at_church', 'c6c9563e416fcbc3f09a91c64cfbc28401fcbe62dbaf3a433b8f669d4e7f6e6e'),
  (193, '0193_clock_ins_by_team', 'b93c196dbe7b4cee485beb8e9fb9fb74630de96f2d79f051d2038cc0c95545f0'),
  (194, '0194_asking_to_be_clocked_in_and_the_reminder', '913d6fefb2cbb8a3fc236947b0292a5eee6e1e84416fcb30636a601cadaa920c'),
  (195, '0195_am_i_at_church', '087fb6196d86fd58f660030f956e1824a5e7b39597d23ab193fdabb1a0569f64'),
  (196, '0196_pastor_is_a_role', '8ba3155c2887066aeb50bd212db61f495efdbc43d8108b434db1eea73e217499'),
  (197, '0197_prayer_requests', '42ce36ff69fd87594564dcdf28bbe725ae53e62133dddc2fec42f0a0cb70c334'),
  (198, '0198_praying_on_the_pastors_behalf', '65670238391044a0490e46be5ffe116b7f1e411047917d63b4551fccb6aae221'),
  (199, '0199_prayer_and_clock_in_are_live', '7a6e085c224ed9c398d6cbcfed5fb8815660ebfd0d08b82980b56dca26ca5967'),
  (200, '0200_a_rule_for_changing_rows_no_longer_runs_on_every_read', 'b2b37ecce13cf83829c96916c582fb69f6bcc0325c0fa18bce662c484b632266'),
  (201, '0201_a_read_rule_asks_its_question_once_per_query', '9e85f4daa46261deadec29e1aed3bbd6a06f81bc327e376148458639d9900f54'),
  (202, '0202_screens_hear_that_a_table_changed_not_what_changed', '5832ac63b7197f14e2b4fc7dcaef4170ee3bd2efc83791eb31455e13ff1d633f'),
  (203, '0203_the_change_log_is_no_longer_read_for_screens', '25285e37bc0d219f4c1effe73df61d7a541d1e5c8bc53d031f153acdf206cf6c'),
  (204, '0204_every_foreign_key_that_is_looked_up_by_has_an_index', 'f5a3aa152cdb0419b46a772abd2171087fa98d017ba75d56c2481f723e5b804e'),
  (205, '0205_small_tidy_ups_from_the_database_review', '17c71618922a6e6e9bfd0a63160a3f53b7bb0a1fce326dfe09e674d50211a88b'),
  (206, '0206_nobody_signed_out_calls_the_databases_functions', 'efc6d39448892013eabc57687c9de052f44d37d7231d6a0d5afed59cc10278b6'),
  (207, '0207_may_asks_its_questions_in_fewer_cheaper_reads', '65e43038cdc36ed200df7e14832c922f23d511cb615b2fc778e118b3e0976a7a'),
  (208, '0208_a_person_or_a_team_can_be_given_one_thing_more', '810bcc37424ac0515907aae90285a2334779d8d8ac0118e5958544fc79fa09d1'),
  (209, '0209_who_sees_the_clock_ins_is_a_row_in_the_grid', 'b4d9661ccb23505f06b6c91572e6b7c1deddaa4ab8d0c454b9354701e07403c2'),
  (210, '0210_prayers_three_lists_are_rows_in_the_grid', 'e13743c992b226e5e47615da92a1709efcbfd785fa496d6571865fa1d59f5abe'),
  (211, '0211_the_service_planners_buttons_are_rows_in_the_grid', 'a17a9a13ff534c4ff803f776bad00367609cd5b85022eb494857966ecd278a07'),
  (212, '0212_who_may_draw_the_stage_is_rows_in_the_grid', '0dd41a9ac83e422e74614fa99ed1cb6c73908fb18a14152588d5de836d057986'),
  (213, '0213_who_approves_a_clock_in_request_is_a_row_in_the_grid', 'c0d6012dc232aa7c9aac0825fd8bb7ce4a0a6aaab048faf30802d14faf783a51'),
  (214, '0214_overwatch_and_pastor_are_columns_in_the_grid', 'a5af2bd555508fbe01bae6a20455c2f40a58c0e1e3dd580cf80333b64b6d1453'),
  (215, '0215_who_may_open_a_page_is_a_row_in_the_grid', '04c11ff10b7e2e02a404562cc0eedf2f54ec0a590f87d458205ffd09e05b85b5'),
  (216, '0216_a_log_of_who_changed_which_rule', '3d8d843298fe9ae868f213f0b344c587b4866050de04780178ba68e36dca06c1'),
  (217, '0217_drop_the_settings_the_grid_replaced', 'e0465b6fdf125fbdfb47799ce6fc92deac14379f538ec562283f040f40faf7a4'),
  (218, '0218_a_grant_can_have_an_end_date', 'b97d5a27f85abfccd1e148ae75e62f07f6932659e17df1becc86ee4110f2d796'),
  (219, '0219_church_events_go_sixty_days_after_they_end', '5b9d2113ca84ad6adeea39322fa47bb81774a61ec448dcf087225fc1f3c9c41f'),
  (220, '0220_availability_reminders_say_which_service_and_go_once_answered', 'bc61e5602554ef1a622b741ed3465a40b7f4f07b2675d57376b3a2d99b8c713b'),
  (221, '0221_remind_everyone_who_has_not_answered_for_a_service', '6ec697b91c187887d5873ffbeffceb17881a67c99bcca1868e5baf1b8230f022'),
  (222, '0222_editing_a_template_updates_the_services_it_made', '7e7822b8f643c8af85cf24e17ee9ef1344992674d7e111ebe804393e57f65b41'),
  (223, '0223_the_planner_lists_three_weeks_of_upcoming_services', 'def1f88aae793a8cadc1a50c482712b494b70c5d10cab32aec86edabe419ceb9'),
  (224, '0224_call_times_reach_each_team_by_push', 'caf809ff83f4ac6ac3a10c4be37fa7ed92a01a092809bd44634fc91f1f82d561'),
  (225, '0225_a_clock_in_request_says_when_they_arrived', '841263109698870d1856a8d206fc44b4a365c096522457e6d2a51e1b82141ea9'),
  (226, '0226_clock_in_marks_only_the_teams_somebody_is_on', '619574a90b365918d01f1fe227f30b2aae6ed0307dd9f4dc5eced4d193555b58'),
  (227, '0227_everybody_on_a_team_can_clock_in', 'd4bb37ba20f3dfb52b3f58847994d3adca3839117f21a2f72abcf0a478a86627'),
  (228, '0228_who_has_allowed_location', '7bd4322f71d7539a7e0a7911fb49eb2842c73ee5be3cdc5ae340960e9d49698e'),
  (229, '0229_adding_a_clock_in_for_somebody_already_in_changes_its_time', 'dc918e4577c499971be46e141b9eb772f816b818679cd9ea040d6af6285b8e8f'),
  (230, '0230_the_database_looks_up_clock_in_addresses', 'f7d2024770cbb305840562c22f762f44a4548f9d39c39866b270bc602c726458'),
  (231, '0231_location_access_says_which_browser', '27fe7b1a61ac6dc01bde61024ac5ba8ba98aa47bddaac2b9804a6826c4053e78'),
  (232, '0232_check_all_on_a_checklist', '5d3d577adfafeeae9eb21c2051283b84b0bc40e6114255091455504c8f7b35b0'),
  (233, '0233_a_video_tutorial_link_the_owner_sets', '73fb485549e6133d2a01387bd816595b28803598d052d831283a1f7eff89176a'),
  (234, '0234_events_that_repeat', '24afd4a0f310053b4a685fd9f5205a2752bcfe04d692dade0d9c576ba25e0073'),
  (235, '0235_a_repeating_event_with_no_end_date', 'cf42528fb9aa341ecff1fea2a69b8ed00f98938844bade18177b7084b67dc08d'),
  (236, '0236_an_event_can_say_when_it_ends', '6cb132223c278aac84db85a482c11caf120faa230147badc49b123b20889b0ca'),
  (237, '0237_an_event_can_belong_to_several_teams', '0012730355b70abd0c17829efd2669e1635a0375cde561ed8450c09c401030be'),
  (238, '0238_an_event_is_seen_by_who_it_is_for', '7e01cc6996526902c16d9df552922438fb7d1322d8f22b628e2210fead8dd89c'),
  (239, '0239_an_event_can_carry_a_link', 'e8cfeb1908ddec3faae55c48fb3d393cecf74907e45f6bbd72fa1de841bcf212'),
  (240, '0240_an_event_can_carry_several_named_links', 'f093b4c0e4a7400d4e9b9fe2d5312d5289f59a6bb0f08cb3437af2b7a2f3ca6d'),
  (241, '0241_the_song_library_keeps_every_song', '9a121e614f18727dfbd492191f94163e6e502ec2da88a38d5dd23b58629bf2cd'),
  (242, '0242_address_lookups_run_when_needed', '704ac3bcfa579f309d4860cfea060515473081e5747fda7474409a32a9d2761b'),
  (243, '0243_a_songs_page_for_the_song_library', '7fce684780613cdc64000784ac6d6cc7ed8ac62cd7a6a62804e11c5fac71592d'),
  (244, '0244_registration_events_anybody_can_sign_up_for', 'be31fab7270a31df047308e3b1425e6f01f1dc4ef5114728303a23587840463b'),
  (245, '0245_registrations_run_from_the_dashboard', '28df484a36b20289c7ed45b1140e0744bbb905e2af61f187335907ba48074816'),
  (246, '0246_deleting_an_event_takes_its_orders_with_it', '7378c1300e41a1fbac5107716b6ce050d23c4db58106378f6a9c68b205803f03'),
  (247, '0247_reception_at_the_door', 'd120ef6387c1e6830361ae885da0aa0f2d778e24aea81f04b9c237d9a5a8d7a9'),
  (248, '0248_the_pictures_focal_point', 'b5ddb1c60b24fc6e79cccb1a80b67418c043848a56d1f194424580201dffb335'),
  (249, '0249_online_events', '7606f690e002d7bf952bde1e14df8518b2ab846aca227c8b8b2cc59989784686'),
  (250, '0250_cancelling_an_event_and_refunds', '5b72e624253fb58252bfe3893c5d94fe3e210b46a7414df207308a53929f165a'),
  (251, '0251_separate_rights_for_registrations', '1b2a960cecc9bebbdff9459d6ff27fa8fc78fd5a8797b791c65ecd176788959a'),
  (252, '0252_refund_details_wanted_is_never_null', '2f49f38f64bf87a36564faef1e8c6cda2935222b09a444fe7f62850fbf3007ff'),
  (253, '0253_refund_details_as_a_choice', '710f31fbca97c409b8d3d4e8cd479c31447fcbb265d96f4936419a6a01912b97'),
  (254, '0254_the_link_stays_and_no_money_on_a_cancelled_order', 'd6a035b08291861b393ac144e0f3eb43301d95055c97bd8243f7cdeadce407bf'),
  (255, '0255_a_deleted_event_leaves_the_diary', 'b613331ee5b85c4256b8c9fa5d8ffdd5df260e53b305dedb1ba56862d0d809cd'),
  (256, '0256_birthdays_without_the_year', 'de5c04fadebf562bb018cc0aa72053215def5c3e4c25a596c5c7f31f06ddff3b'),
  (257, '0257_date_of_birth_closes_to_everyone_but_admins', '02d53a2529076b471c44489d1b26ac06d600c25bcb3bfa05ec075646720b739b'),
  (258, '0258_who_sees_ages_is_a_setting', '3393bdccef28461fd616b670a9d3d4875a317d57e2b6404dc68c1029cd1e62fe'),
  (259, '0259_a_checklist_line_can_be_optional', 'ce38c31372fdf683904996c2e431e3a1a1639d9b42f43c242d7e954912a4ee0e'),
  (260, '0260_a_checklist_for_during_the_service', '0ae395713e5b95eb0425d4225fd44959b98bc8d802bd05cdfd6dc6a6cdfb5ad8'),
  (261, '0261_a_page_for_the_service_clock', 'd1bc864ac4b5613ed7a0f09af7293c3abb837a9d3681d1fa0b4df4d52dd51b81'),
  (262, '0262_an_event_says_whether_it_is_a_meeting', '00a7ee3afebc1d8a2c45c0304309a91ed82f94b5c209bfd8a34cb64a1c5d02ec'),
  (263, '0263_a_run_of_days_can_be_changed_a_day_at_a_time', '0d3ceda078f635cf93b293e6d793c9f4566b04d73ef5e60d8057e027fb81774a'),
  (264, '0264_who_sees_the_countdown_is_its_own_row', 'fbaaa7299f61286f6ce4ae491e0823fd8ec22dee5d8ba3d4e32640d44733e45e'),
  (265, '0265_the_old_countdown_page_row_goes', '798d140ca1124e56d8866f43c96207e332c201b7e393c8c03564b236f2a541f1'),
  (266, '0266_nobody_is_checked_in_owing', '95d786d18f2242ea11764f6af9359b8cf27976918045f7827a4338e4e2c37932'),
  (267, '0267_the_pastor_verifies_a_payment', '585699fee07bdbc18e7c9637bda41cf708297230c0900c2cedc230b94673a2ca'),
  (268, '0268_a_pastor_has_a_cell_on_every_row', '3783f3fb8ffddd40df2cff09cca5f09b6c99149b0e76c1e9a52191b3d6bf7cb8'),
  (269, '0269_every_cell_that_can_be_set_is', '9ba98e5502e8e628ad1ad6278023426f220ff049f1e23d29d862e91ab1c8863d'),
  (270, '0270_overwatch_has_a_cell_on_every_row', '191e1ffa73166ba78356044bf54d9416a3ec123f2a4db1b7bf047bfe91a8f9cd'),
  (271, '0271_a_visitor_can_send_a_receipt_again', '2a6c1f6f72ce6f3117745d981ab120f3699beb5a3aa689621350628d47744856'),
  (272, '0272_overwatch_has_no_cell_for_asking_to_join', '9c5234e51e990e1f4cf248429e2f20105d4f992f9669dfdabfc9983d3dc90750'),
  (273, '0273_one_person_can_be_refused_one_thing', 'c4041c6b73e768221878b42ba7bf74c6f46c08e1f666ca36184575811ebf86c8'),
  (274, '0274_a_page_can_be_kept_to_the_admins_or_the_owner', '47477c7bb6567102cd32e1a3dbd7e6163556cf04699e4b5c32e6b3bc3c13c1fe'),
  (275, '0275_an_admins_yes_on_clock_in_and_stage_is_a_choice', '6230f5c760a4e0c8f9ec332b4c9fc3e3a49ca606820559a2319ba4f4d582b7d0'),
  (276, '0276_everybody_is_asked_who_they_are_and_what_is_still_to_set_up', '32ae97fd1c73f0fbdeb13fcac277e831572cd4905c0ef35d93cb9e65f49228cc'),
  (277, '0277_nothing_in_settings_is_fixed', '90b6aa29b580a3ae60b8f491b3d4a0e230faabf4c4666f72bdc7b2a441aae45c'),
  (278, '0278_a_notice_for_everybody_and_a_door_that_closes', 'ca5a93e5d78c49946f51e1a577adf33618135d5b05d35fa77e78b26e4229af15'),
  (279, '0279_an_account_can_be_blocked_without_being_removed', 'efa304620eb885a83ee38e5aeb7bfed461ae92bb2e2d5d2b2c9fcb5dcb32d2c6'),
  (280, '0280_a_clock_in_remembers_its_call_time', 'cc7d111588c20527c4442d657386a7730aaf617b9571e0f21654c531dd652396'),
  (281, '0281_a_registration_can_be_put_back_as_it_was', '29206c73017ae87e4fff6620965ec95fdd1b94e645aa31d298cdb5b3e6938fd6'),
  (282, '0282_a_role_can_have_permanent_people', 'b31d29894b3431fec8f483e343e3fec76589be1b335dee8dcc9c48de4d099aa9'),
  (283, '0283_an_email_that_bounced_says_so', 'b451d2da164cb0ab2e28cd8bccd3c1d71c0e176fa2475ee7e17986d7ba26b32c'),
  (284, '0284_the_app_says_when_something_broke', '68130d2ccd1969c3bc5c8cde01e94e2348961376d1a8a3971a49ef651d800fa3')
on conflict (version) do nothing;

/*
 * The one number. The rows in order, counted from one: a row whose number
 * is its place in the line has nothing missing before it.
 */
create or replace function public.schema_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(s.version), 0)
    from (select m.version, row_number() over (order by m.version) as place from public.schema_migrations m) s
   where s.version = s.place
$$;

comment on function public.schema_version() is
  'The highest migration number N for which 1..N are all recorded (0285).';

revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;

/* The rows, for the check that the database and the repository agree. */
create or replace function public.schema_ledger()
returns table (version integer, name text, checksum text, applied_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.version, m.name, m.checksum, m.applied_at from public.schema_migrations m order by m.version
$$;

comment on function public.schema_ledger() is
  'Every recorded migration: number, name, checksum, when (0285). Public, like the files it describes.';

revoke all on function public.schema_ledger() from public;
grant execute on function public.schema_ledger() to anon, authenticated;

/*
 * health() (0284), with the number. Its body is production's
 * (pg_get_functiondef) and the one key more.
 */
create or replace function public.health()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'at', now(), 'schema', public.schema_version())
$$;

/*
 * health_overview() (0284), with what the ledger says, for Settings › App
 * Health. Its body is production's (pg_get_functiondef) and the one key more.
 */
create or replace function public.health_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  jobs jsonb := '[]'::jsonb;
  asked integer := 0;
  answered integer := 0;
  refused integer := 0;
begin
  if not public.may(auth.uid(), 'settings.health') then
    raise exception 'You may not see the app''s health.' using errcode = '42501';
  end if;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', j.jobname,
               'schedule', j.schedule,
               'active', j.active,
               'runs', coalesce(d.runs, 0),
               'failed', coalesce(d.failed, 0),
               'last_at', d.last_at,
               'last_ok', d.last_status is distinct from 'failed'
             ) order by j.jobname), '[]'::jsonb)
        from cron.job j
        left join lateral (
          select count(*)::int as runs,
                 (count(*) filter (where r.status = 'failed'))::int as failed,
                 max(r.start_time) as last_at,
                 (array_agg(r.status order by r.start_time desc))[1] as last_status
            from cron.job_run_details r
           where r.jobid = j.jobid
        ) d on true
    $q$ into jobs;
  end if;

  if to_regclass('supabase_functions.hooks') is not null and to_regclass('net._http_response') is not null then
    execute $q$
      select count(*)::int,
             (count(r.id) filter (where r.status_code between 200 and 299))::int,
             (count(r.id) filter (where r.timed_out is true or r.error_msg is not null or r.status_code is null or r.status_code >= 400))::int
        from supabase_functions.hooks h
        left join net._http_response r on r.id = h.request_id
       where h.created_at > now() - interval '6 hours'
         and h.hook_name like 'push%'
    $q$ into asked, answered, refused;
  end if;

  return jsonb_build_object(
    'at', now(),
    'jobs', jobs,
    'pushes', jsonb_build_object('asked', asked, 'answered', answered, 'failed', refused, 'hours', 6),
    'database', jsonb_build_object(
      'bytes', pg_database_size(current_database()),
      'connections', (select count(*) from pg_stat_activity),
      'connections_max', current_setting('max_connections')::int
    ),
    'errors', jsonb_build_object(
      'day', (select count(*) from public.client_errors where last_at > now() - interval '1 day'),
      'kept', (select count(*) from public.client_errors)
    ),
    'schema', (
      select jsonb_build_object(
        'version', public.schema_version(),
        'recorded', (select count(*) from public.schema_migrations),
        'latest', (select m.name from public.schema_migrations m order by m.version desc limit 1),
        'latest_at', (select m.applied_at from public.schema_migrations m order by m.version desc limit 1)
      )
    )
  );
end;
$function$;

select public.migration_done(285, '0285_the_database_says_which_migrations_it_has', '202ab60c3a32f910361b3df1b7bc1329cc5f42ded46ac7e5a500da5fe9029122');

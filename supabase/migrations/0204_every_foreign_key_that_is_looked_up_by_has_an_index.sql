/*
 * Every foreign key that is looked up by has an index.
 *
 * 118 of the 197 foreign keys had none. Postgres indexes the referenced
 * side of a key (the parent's primary key) but not the referencing
 * column, so two things scanned whole tables: following a key from the
 * parent (a team's members, a service's sessions, one person's rota), and
 * every cascade, set-null or restrict check when a parent row goes. The
 * nightly retention job deletes old services, which checks each table
 * that points at services, and removing an account checks the 96 keys
 * that point at profiles.
 *
 * The tables are small today, so most of these scans were cheap. Some
 * were not: department_members.user_id is how every page asks "which
 * teams am I on", and rota_assignments.user_id is one of the read rules
 * since 0201.
 *
 * 63 indexes, one per key. The 55 keys left without one are "who did
 * it" columns — created_by, updated_by, decided_by and the like — that
 * nothing filters on; their only cost is the check when an account is
 * removed, which is rare and still small.
 *
 * Plain `create index`, not concurrently: a migration runs in a
 * transaction, and the largest of these tables has 472 rows.
 */

create index if not exists activity_department_id_idx on public.activity (department_id);
create index if not exists announcements_author_id_idx on public.announcements (author_id);
create index if not exists app_owner_user_id_idx on public.app_owner (user_id);
create index if not exists attendance_service_id_idx on public.attendance (service_id);
create index if not exists availability_department_id_idx on public.availability (department_id);
create index if not exists availability_change_requests_service_id_idx on public.availability_change_requests (service_id);
create index if not exists availability_history_department_id_idx on public.availability_history (department_id);
create index if not exists checklist_items_assigned_to_idx on public.checklist_items (assigned_to);
create index if not exists checklist_items_checklist_id_idx on public.checklist_items (checklist_id);
create index if not exists checklists_service_id_idx on public.checklists (service_id);
create index if not exists church_events_department_id_idx on public.church_events (department_id);
create index if not exists clock_in_history_user_id_idx on public.clock_in_history (user_id);
create index if not exists department_guests_guest_id_idx on public.department_guests (guest_id);
create index if not exists department_members_user_id_idx on public.department_members (user_id);
create index if not exists department_permissions_capability_role_key_idx on public.department_permissions (capability, role_key);
create index if not exists department_role_checklist_items_department_id_idx on public.department_role_checklist_items (department_id);
create index if not exists family_link_requests_replaces_member_idx on public.family_link_requests (replaces_member);
create index if not exists guest_availability_department_id_idx on public.guest_availability (department_id);
create index if not exists guest_availability_history_department_id_idx on public.guest_availability_history (department_id);
create index if not exists guest_availability_history_guest_id_idx on public.guest_availability_history (guest_id);
create index if not exists guest_rota_assignments_department_id_idx on public.guest_rota_assignments (department_id);
create index if not exists guest_rota_assignments_guest_id_idx on public.guest_rota_assignments (guest_id);
create index if not exists guest_rota_assignments_role_id_idx on public.guest_rota_assignments (role_id);
create index if not exists guests_became_member_idx on public.guests (became_member);
create index if not exists inventory_documents_department_id_idx on public.inventory_documents (department_id);
create index if not exists inventory_items_held_by_idx on public.inventory_items (held_by);
create index if not exists invitations_department_id_idx on public.invitations (department_id);
create index if not exists messages_author_id_idx on public.messages (author_id);
create index if not exists messages_department_id_idx on public.messages (department_id);
create index if not exists ownership_transfers_from_user_idx on public.ownership_transfers (from_user);
create index if not exists ownership_transfers_to_user_idx on public.ownership_transfers (to_user);
create index if not exists permission_catalog_role_key_idx on public.permission_catalog (role_key);
create index if not exists prayer_list_items_request_id_idx on public.prayer_list_items (request_id);
create index if not exists prayer_responses_user_id_idx on public.prayer_responses (user_id);
create index if not exists purchase_requests_category_id_idx on public.purchase_requests (category_id);
create index if not exists purchase_requests_inventory_item_id_idx on public.purchase_requests (inventory_item_id);
create index if not exists purchase_requests_requested_by_idx on public.purchase_requests (requested_by);
create index if not exists rota_assignments_department_id_idx on public.rota_assignments (department_id);
create index if not exists rota_assignments_role_id_idx on public.rota_assignments (role_id);
create index if not exists rota_assignments_user_id_idx on public.rota_assignments (user_id);
create index if not exists rota_checklist_progress_item_id_idx on public.rota_checklist_progress (item_id);
create index if not exists rota_release_requests_requested_by_idx on public.rota_release_requests (requested_by);
create index if not exists rota_release_requests_requesting_department_id_idx on public.rota_release_requests (requesting_department_id);
create index if not exists service_debrief_items_assigned_to_idx on public.service_debrief_items (assigned_to);
create index if not exists service_debriefs_department_id_idx on public.service_debriefs (department_id);
create index if not exists service_issues_department_id_idx on public.service_issues (department_id);
create index if not exists service_issues_raised_by_department_id_idx on public.service_issues (raised_by_department_id);
create index if not exists service_series_template_id_idx on public.service_series (template_id);
create index if not exists service_session_assignees_guest_id_idx on public.service_session_assignees (guest_id);
create index if not exists service_sessions_department_id_idx on public.service_sessions (department_id);
create index if not exists service_team_readiness_department_id_idx on public.service_team_readiness (department_id);
create index if not exists set_list_items_led_by_idx on public.set_list_items (led_by);
create index if not exists stage_blocks_person_id_idx on public.stage_blocks (person_id);
create index if not exists stage_comments_author_idx on public.stage_comments (author);
create index if not exists stage_comments_block_id_idx on public.stage_comments (block_id);
create index if not exists stage_move_requests_block_id_idx on public.stage_move_requests (block_id);
create index if not exists stage_move_requests_requested_by_idx on public.stage_move_requests (requested_by);
create index if not exists stage_template_requests_requested_by_idx on public.stage_template_requests (requested_by);
create index if not exists team_messages_author_id_idx on public.team_messages (author_id);
create index if not exists team_messages_service_id_idx on public.team_messages (service_id);
create index if not exists team_poll_votes_user_id_idx on public.team_poll_votes (user_id);
create index if not exists user_roles_department_id_idx on public.user_roles (department_id);
create index if not exists user_roles_service_id_idx on public.user_roles (service_id);

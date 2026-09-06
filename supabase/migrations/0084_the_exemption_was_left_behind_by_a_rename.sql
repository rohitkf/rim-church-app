-- ============================================================================
-- Team Coordinator is the exemption the rule already meant
-- ============================================================================
-- 0052 made Coordinator exempt from one-role-per-service, because
-- coordinating is oversight rather than a job on the floor: the person
-- running the cameras being asked to coordinate Media is normal, and the
-- rota refused it.
--
-- Then 0071 renamed the role. Every `department_roles` row and every
-- `rota_assignments` row became "Team Coordinator", and
-- `is_rota_coordinator` was widened to accept both names — but the two
-- partial indexes from 0052 were left testing the old word alone. Since
-- that migration a Team Coordinator row has counted as an ordinary role,
-- so assigning it to somebody who already has one comes back as
--
--     duplicate key value violates unique constraint
--     "rota_assignments_one_role_per_service"
--
-- which is the rota enforcing a rule the app's own page says it does not
-- have. The page is right; the index is a rename that was not finished.
--
-- Both names are accepted, exactly as `is_rota_coordinator` accepts them
-- and as `isCoordinatorRole` does in the app: an assignment restored from
-- a backup, or a team that types the old word next year, means the same
-- job. `btrim` for the same reason it is there — the label is free text
-- copied at the moment somebody was assigned.
--
-- Nothing to backfill. The narrower rule is the old one, so no row that
-- fits today can stop fitting.
-- ----------------------------------------------------------------------------

drop index if exists rota_assignments_one_role_per_service;
drop index if exists rota_assignments_one_coordinator_per_team;

-- One role per person per service. Coordinating is not one of them.
create unique index rota_assignments_one_role_per_service
  on public.rota_assignments (service_id, user_id)
  where lower(btrim(role_label)) not in ('coordinator', 'team coordinator');

-- Exempt from that rule, not from arithmetic: one person cannot be the
-- same team's Coordinator twice over at the same service.
create unique index rota_assignments_one_coordinator_per_team
  on public.rota_assignments (service_id, department_id, user_id)
  where lower(btrim(role_label)) in ('coordinator', 'team coordinator');

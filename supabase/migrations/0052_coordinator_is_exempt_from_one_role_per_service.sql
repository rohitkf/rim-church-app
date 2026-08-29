-- ============================================================================
-- Coordinating a team is not "having a role" for the one-role-per-service rule
-- ============================================================================
--
-- A person holds one role per service, so nobody is rostered in two places
-- at once. Coordinator broke that: it is oversight rather than a job on the
-- floor, so the Media Director being asked to coordinate Media is normal,
-- and the rota refused it with
--
--     duplicate key value violates unique constraint
--     "rota_assignments_service_id_user_id_key"
--
-- The rule stands for everything else — being Camera Operator in Media and
-- Usher in Hospitality at the same service is still two places at once —
-- so rather than dropping the constraint it becomes partial: Coordinator
-- rows are simply not counted.

alter table public.rota_assignments
  drop constraint rota_assignments_service_id_user_id_key;

-- One role per person per service, Coordinator not counted. Matched with
-- lower() to agree with is_rota_coordinator(), which decides who may verify
-- a checklist off the same text.
create unique index rota_assignments_one_role_per_service
  on public.rota_assignments (service_id, user_id)
  where lower(role_label) <> 'coordinator';

-- Coordinator is exempt from the rule above, not from arithmetic: one
-- person cannot be the same team's Coordinator twice over.
create unique index rota_assignments_one_coordinator_per_team
  on public.rota_assignments (service_id, department_id, user_id)
  where lower(role_label) = 'coordinator';

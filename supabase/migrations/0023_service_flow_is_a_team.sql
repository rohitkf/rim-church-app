-- ============================================================================
-- Service Flow Coordinator is a team, not a per-service role grant
-- ============================================================================
-- The original model made "Service Flow Coordinator" a role_type granted to
-- a person for one service. It is really a department like any other, with
-- its own head and members, whose rota decides who coordinates a given
-- service — that is what is_service_flow_signer() (migration 0019) already
-- encodes for the role checklists.
--
-- Everything else still asks the old question through
-- is_service_coordinator() / is_any_coordinator(): the running order, call
-- times, the legacy per-department checklists' final stage. Rather than
-- rewrite a dozen policies, both helpers are redefined to read the team.
-- Nobody holds the old role grants under the new model, so left as they
-- were these checks would simply never be true and final sign-off would
-- have quietly become Admin-only.
--
-- The service_flow_coordinator enum value stays: dropping an enum value
-- needs the type rebuilt, and it is now simply unused.
create or replace function public.is_service_coordinator(uid uuid, svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_service_flow_signer(uid, svc_id);
$$;

-- "Is this person a coordinator at all", used to widen read access rather
-- than to grant an edit — membership of the Service Flow team is the right
-- answer, whether or not they are on a particular service's rota.
create or replace function public.is_any_coordinator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_members dm
    join public.departments d on d.id = dm.department_id
    where dm.user_id = uid and d.is_service_flow
  ) or exists (
    select 1 from public.departments d
    where d.is_service_flow and public.is_dept_head(uid, d.id)
  );
$$;

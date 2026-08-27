-- ============================================================================
-- Anyone on the sign-off team can give the final signature
-- ============================================================================
-- The signature was tied to being the person the rota put on Service Flow
-- for that service, or that team's head — so the rest of the team could
-- watch a checklist sit at head_verified with no way to finish it, which is
-- exactly the hold-up this stage is meant to prevent.
--
-- Being on the team that signs checklists off is now enough. The rota
-- clause stays for anyone rostered onto Service Flow without being a
-- standing member of it (a guest covering the service).
--
-- Every policy and the stage guard read this function, so widening it here
-- widens the signature everywhere it is checked, and nowhere else: the
-- volunteer's tick and the head's verification are untouched.
create or replace function public.is_service_flow_signer(uid uuid, svc_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.rota_assignments ra
    join public.departments d on d.id = ra.department_id
    where ra.service_id = svc_id and d.is_service_flow and ra.user_id = uid
  ) or exists (
    select 1
    from public.department_members dm
    join public.departments d on d.id = dm.department_id
    where dm.user_id = uid and d.is_service_flow
  ) or exists (
    select 1 from public.departments d
    where d.is_service_flow and public.is_dept_head(uid, d.id)
  );
$$;

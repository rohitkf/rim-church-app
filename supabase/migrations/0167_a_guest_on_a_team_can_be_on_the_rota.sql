/*
 * A guest on a team can be on the rota.
 *
 * 0166 let a Head say that Steve — on Worship's list, with no account —
 * can serve on Sunday. The rota still could not use the answer: a role is
 * held by an account (`rota_assignments.user_id`), so his name was never
 * in the Person list and the yes went nowhere.
 *
 * So the roll's people hold roles in their own table, beside the account
 * holders', as their answers are kept beside theirs (0161, 0166 give the
 * reason). Everything else that reads the rota — who to notify, who a
 * poll goes to, whose checklist is waiting, who coordinates — is about
 * somebody who signs in, and goes on reading `rota_assignments` alone.
 * A guest's role is one line on the rota: who, which role, for which team
 * and service. They have no checklist to tick and cannot coordinate, since
 * coordinating hands somebody the team's checklist.
 *
 * The rules are the rota's own:
 *   · putting them on or taking them off — "rota.assign", as for anybody
 *   · one role per service, as for anybody (Team Coordinator aside, which
 *     a guest cannot hold)
 *   · only somebody on that team's list
 *
 * Saying they cannot make it takes them off, as it does for anybody
 * (0092), and the feed says so (0165). Taking them off the team takes
 * them off its rota; signing up and being linked moves their roles for
 * services still to come onto their account.
 */

create table if not exists public.guest_rota_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  role_label text not null check (length(btrim(role_label)) between 1 and 80),
  role_id uuid references public.department_roles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint guest_rota_not_a_coordinator
    check (lower(btrim(role_label)) <> all (array['coordinator', 'team coordinator'])),
  unique (service_id, guest_id)
);

comment on table public.guest_rota_assignments is
  'Roles held at a service by the guest roll''s people on a team (0161), who have no account.';

create index if not exists guest_rota_assignments_service_department_idx
  on public.guest_rota_assignments (service_id, department_id);

alter table public.guest_rota_assignments enable row level security;

-- Read by whoever reads the rota.
drop policy if exists guest_rota_assignments_select on public.guest_rota_assignments;
create policy guest_rota_assignments_select on public.guest_rota_assignments
  for select using (
    (select public.is_on_a_team(auth.uid())) or (select public.can_open_page(auth.uid(), 'rota'))
  );

drop policy if exists guest_rota_assignments_write on public.guest_rota_assignments;
create policy guest_rota_assignments_write on public.guest_rota_assignments
  for all using (
    not public.service_has_finished(service_id)
    and public.may(auth.uid(), 'rota.assign', department_id, service_id)
  )
  with check (
    not public.service_has_finished(service_id)
    and public.may(auth.uid(), 'rota.assign', department_id, service_id)
    and exists (
      select 1 from public.department_guests dg
      where dg.guest_id = guest_rota_assignments.guest_id
        and dg.department_id = guest_rota_assignments.department_id
    )
  );

-- The feed, in 0165's words: who was put on, and why they came off.
create or replace function public.activity_from_guest_rota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  who text;
begin
  select nullif(btrim(name), '') into who from public.guests where id = row_now.guest_id;
  perform public.record_activity(
    row_now.service_id, row_now.department_id, auth.uid(), 'rota',
    row_now.role_label,
    case
      when tg_op = 'INSERT' then coalesce(who, 'someone') || ' assigned'
      when coalesce(current_setting('rim.rota_dropout', true), '') = 'on'
        then coalesce(who, 'someone') || ' off, marked can''t serve'
      else coalesce(who, 'someone') || ' taken off'
    end
  );
  return row_now;
end;
$$;

drop trigger if exists activity_guest_rota on public.guest_rota_assignments;
create trigger activity_guest_rota
  after insert or delete on public.guest_rota_assignments
  for each row execute function public.activity_from_guest_rota();

-- Can't make it frees the role, as it does for anybody (0092).
create or replace function public.guest_availability_dropout_frees_the_rota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'unavailable' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'unavailable' then
    return new;
  end if;
  perform set_config('rim.rota_dropout', 'on', true);
  delete from public.guest_rota_assignments
  where service_id = new.service_id
    and department_id = new.department_id
    and guest_id = new.guest_id;
  perform set_config('rim.rota_dropout', 'off', true);
  return new;
end;
$$;

drop trigger if exists guest_availability_dropout_frees_the_rota on public.guest_availability;
create trigger guest_availability_dropout_frees_the_rota
  after insert or update of status on public.guest_availability
  for each row execute function public.guest_availability_dropout_frees_the_rota();

-- Taken off the team, they come off its rota with their answers (0166).
create or replace function public.department_guest_gone_takes_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.guest_availability
  where guest_id = old.guest_id and department_id = old.department_id;
  delete from public.guest_rota_assignments
  where guest_id = old.guest_id and department_id = old.department_id;
  return old;
end;
$$;

/*
 * 0166's sign-up move, which now brings their roles too: those for
 * services still to come become roles on the account — unless the account
 * already holds one at that service, since one role each is the rule.
 */
create or replace function public.guest_joined_moves_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.became_member is null and new.became_member is not null then
    insert into public.department_members (department_id, user_id, member_type)
    select dg.department_id, new.became_member, dg.member_type
    from public.department_guests dg
    where dg.guest_id = new.id
    on conflict (department_id, user_id) do nothing;

    insert into public.availability (user_id, service_id, department_id, status, note)
    select new.became_member, ga.service_id, ga.department_id, ga.status, ga.note
    from public.guest_availability ga
    where ga.guest_id = new.id
      and not public.service_has_finished(ga.service_id)
    on conflict (user_id, service_id, department_id) do nothing;

    insert into public.rota_assignments (service_id, department_id, user_id, role_label, role_id)
    select gr.service_id, gr.department_id, new.became_member, gr.role_label, gr.role_id
    from public.guest_rota_assignments gr
    where gr.guest_id = new.id
      and not public.service_has_finished(gr.service_id)
      and not exists (
        select 1 from public.rota_assignments ra
        where ra.service_id = gr.service_id and ra.user_id = new.became_member
      );

    delete from public.guest_rota_assignments where guest_id = new.id;
    delete from public.guest_availability where guest_id = new.id;
    delete from public.department_guests where guest_id = new.id;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

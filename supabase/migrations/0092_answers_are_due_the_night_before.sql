/*
 * The window for saying whether you can serve closes the night before.
 *
 * It closed when the service started, which is not a deadline — it is the
 * moment the head has already stood in the hall counting heads. Somebody
 * could mark themselves unavailable at 09:59 for a service at 10:00 and
 * be, as far as the rota was concerned, in the right. The answer has to
 * be in while there is still an evening to do something about it.
 *
 * So: 23:59 on the day before the service, which for a Sunday morning is
 * Saturday night. The time is a setting; the day is always the service's
 * own eve, so a Saturday service closes on Friday and a midweek one the
 * night before itself, rather than a fixed weekday that would shut a
 * Wednesday prayer meeting four days early.
 */

/*
 * Which country's midnight.
 *
 * "23:59" is not a moment until somebody says where. Nothing in this
 * database knew — every timestamp is absolute and every wall clock was
 * the browser's — so the church says once, here, and the deadline means
 * the same thing to the person answering and to the policy refusing them.
 */
alter table public.app_settings
  add column if not exists timezone text not null default 'Europe/London';

alter table public.app_settings
  add column if not exists availability_closes_time time not null default '23:59';

/*
 * A typo in the timezone would be a database that raises on every read of
 * the deadline — `at time zone 'Eurpoe/London'` is an error, not a guess
 * — so it is checked on the way in, where somebody is there to be told.
 */
create or replace function public.app_settings_timezone_is_real()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'There is no timezone called %', new.timezone;
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_timezone_is_real on public.app_settings;
create trigger app_settings_timezone_is_real
  before update on public.app_settings
  for each row execute function public.app_settings_timezone_is_real();

/** The church's own wall clock, with a working answer if the row is gone. */
create or replace function public.church_timezone()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select nullif(btrim(timezone), '') from public.app_settings limit 1),
    'Europe/London'
  );
$$;

/**
 * The last moment an answer counts: the evening before the service, at
 * whatever time the church has set, on the church's own clock.
 *
 * Worked from `services.date` rather than from the running order, so a
 * service nobody has planned yet still has a deadline. Before, a service
 * with no sessions had no start time and therefore no closing time at
 * all — its answers stayed open for ever, which is the quiet half of the
 * same bug.
 */
create or replace function public.availability_closes_at(svc_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select ((s.date - 1) + coalesce(a.availability_closes_time, time '23:59'))
           at time zone public.church_timezone()
  from public.services s
  left join public.app_settings a on true
  where s.id = svc_id;
$$;

/** Whether that moment has passed. A service that isn't there is not shut. */
create or replace function public.availability_is_closed(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.availability_closes_at(svc_id) <= now(), false);
$$;

/*
 * The same three policies, against the new deadline.
 *
 * Admins and department heads are untouched: they could always put an
 * answer right afterwards, and now there is more afterwards to put right
 * in.
 */
drop policy if exists availability_insert on public.availability;
create policy availability_insert on public.availability
  for insert with check (
    not public.service_has_finished(service_id)
    and (
      public.is_admin(auth.uid())
      or (user_id = auth.uid() and not public.availability_is_closed(service_id))
    )
  );

drop policy if exists availability_update on public.availability;
create policy availability_update on public.availability
  for update using (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
    or (user_id = auth.uid() and not public.availability_is_closed(service_id))
  ) with check (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
    or (user_id = auth.uid() and not public.availability_is_closed(service_id))
  );

drop policy if exists availability_delete on public.availability;
create policy availability_delete on public.availability
  for delete using (
    not public.service_has_finished(service_id)
    and (
      public.is_admin(auth.uid())
      or (user_id = auth.uid() and not public.availability_is_closed(service_id))
    )
  );

/*
 * Dropping out gives the role back.
 *
 * A rota built on Tuesday against answers given on Monday goes stale the
 * moment somebody's plans change, and the old arrangement left the name
 * sitting on the role: the volunteer knew they were not coming, the rota
 * said they were, and the head found out on the morning. Saying "I can't"
 * now takes the name off the role it was on and tells the people whose
 * job it is to fill it.
 *
 * The role itself is not deleted — an assignment row *is* the assignment,
 * so removing it puts the role back among the ones the head can fill,
 * which is what the Team Rota page already draws.
 */
create or replace function public.availability_dropout_frees_the_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  freed integer := 0;
  who text;
  team text;
  when_it_is text;
begin
  if new.status <> 'unavailable' then
    return new;
  end if;
  -- Already unavailable and still unavailable is not news.
  if tg_op = 'UPDATE' and old.status = 'unavailable' then
    return new;
  end if;

  delete from public.rota_assignments
  where service_id = new.service_id
    and department_id = new.department_id
    and user_id = new.user_id;
  get diagnostics freed = row_count;

  -- Nobody had put them on anything, so there is nothing to report.
  if freed = 0 then
    return new;
  end if;

  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into who from public.profiles p where p.id = new.user_id;
  select d.name into team from public.departments d where d.id = new.department_id;
  select s.service_type || ' on ' || to_char(s.date, 'FMDay FMDD Mon')
    into when_it_is from public.services s where s.id = new.service_id;

  /*
   * The head and the assisting head, and not the person themselves — a
   * volunteer who has just said they cannot come does not need telling
   * that they cannot come.
   */
  insert into public.notifications (user_id, type, reference_id, body)
  select ur.user_id,
         'rota_dropout',
         new.service_id,
         coalesce(nullif(who, ''), 'Somebody') || ' can no longer serve at ' ||
         coalesce(when_it_is, 'a service') || ' — their ' || coalesce(team, 'team') ||
         ' role is unassigned again'
  from public.user_roles ur
  where ur.department_id = new.department_id
    and ur.role_type in ('department_head', 'assisting_head')
    and ur.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists availability_dropout_frees_the_rota on public.availability;
create trigger availability_dropout_frees_the_rota
  after insert or update on public.availability
  for each row execute function public.availability_dropout_frees_the_rota();

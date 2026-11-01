/*
 * Clock in marks only the teams somebody is on, and counts teams.
 *
 * Rohit clocked in on Sunday 1 November and was told he was marked
 * present "on 3 teams". He is on one, Media. Two things made three:
 *
 *   - clock_in_duties() counted any Yes on availability as a duty, and
 *     he had a Yes for Audio, a team he is not on, given on 25 October.
 *     A Yes now counts only for a team the person is on (its roster, or
 *     its Head or Assisting Head); a place on the rota counts as before.
 *   - clock_in_mark_present() counted team-and-service pairs, so Media
 *     at the English and the Malayalam services was two. It now returns
 *     the number of teams marked.
 *
 * His Audio answer for that day is removed. Answers on production for a
 * team the person is not on were checked when this was written: three in
 * the last fortnight, this one among them.
 */

create or replace function public.clock_in_duties(uid uuid, on_day date)
 RETURNS TABLE(service_id uuid, department_id uuid, call_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select r.service_id, r.department_id
    from public.rota_assignments r
    join public.services s on s.id = r.service_id
    where r.user_id = uid and s.date = on_day
    union
    select a.service_id, a.department_id
    from public.availability a
    join public.services s on s.id = a.service_id
    where a.user_id = uid
      and s.date = on_day
      and a.status = 'available'
      and coalesce((select clock_in_include_yes from public.app_settings limit 1), false)
      -- A Yes counts only for a team they are on (0226).
      and (
        exists (select 1 from public.department_members dm where dm.user_id = uid and dm.department_id = a.department_id)
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = uid and ur.department_id = a.department_id
            and ur.role_type in ('department_head', 'assisting_head')
        )
      )
  )
  select m.service_id, m.department_id,
    ((on_day + coalesce(ct.call_time, time '07:00')) at time zone public.church_timezone()) as call_at
  from mine m
  left join public.department_call_times ct
    on ct.department_id = m.department_id and ct.on_date = on_day;
$function$;

create or replace function public.clock_in_mark_present(uid uuid, on_day date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  duty record;
  marked integer := 0;
  teams uuid[] := '{}';
begin
  perform set_config('rim.clock_in', '1', true);
  for duty in select distinct d.service_id, d.department_id from public.clock_in_duties(uid, on_day) d loop
    if public.service_has_finished(duty.service_id) then
      update public.availability set attended = true
      where user_id = uid and service_id = duty.service_id and department_id = duty.department_id
        and status = 'available' and attended is distinct from true;
    else
      insert into public.availability (user_id, service_id, department_id, status, attended)
      values (uid, duty.service_id, duty.department_id, 'available', true)
      on conflict (user_id, service_id, department_id)
      do update set status = 'available', attended = true
      where availability.status is distinct from 'available' or availability.attended is distinct from true;
    end if;
    if found and not duty.department_id = any (teams) then teams := teams || duty.department_id; end if;
  end loop;
  perform set_config('rim.clock_in', '', true);
  -- Teams marked, not team-and-service pairs: Media at both services is one team (0226).
  return cardinality(teams);
end;
$function$;

delete from public.availability a
using public.services s, public.departments d
where a.service_id = s.id and a.department_id = d.id
  and a.user_id = '02db5a05-0eec-46f5-8a88-ea8cc97350c8'
  and s.date = '2026-11-01' and d.name = 'Audio'
  and not exists (select 1 from public.department_members m where m.user_id = a.user_id and m.department_id = a.department_id);

notify pgrst, 'reload schema';

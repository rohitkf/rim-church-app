/*
 * Editing a template updates the services it made.
 *
 * A repeat (0105) copies its template into each service it makes and never
 * looks back, so an edited template changed nothing already made. On
 * production that showed: the template's "Conclusion | Live Ens" was
 * corrected to "Live End" after the Malayalam services of 8, 15 and 22
 * November were made, and those three still say "Live Ens".
 *
 * save_service_template(id, name, start, sessions, upcoming) saves a
 * template in one go — the page used to write it in three separate calls
 * — and then updates the upcoming services made by a repeat that uses it,
 * as `upcoming` says:
 *
 *   'keep'  (the page's default) each service follows the template's
 *           change except where somebody changed that service by hand: a
 *           session's name, its length, or the start time, each followed
 *           only when it still says what the template used to. Sessions
 *           are added or removed only on a service whose running order
 *           still matched the template exactly.
 *   'all'   each service's running order is made the template's again,
 *           hand changes included.
 *   'none'  services are left as they are.
 *
 * Only services still to come are touched: dated today or later, not
 * started, not finished, nothing held or skipped — and only those the
 * person saving may plan (svc.sessions). Sessions are updated in place,
 * position by position, so whoever is assigned to one stays assigned; a
 * session the template no longer has is removed with its assignments.
 * Start times follow the template's start and the new lengths.
 *
 * It returns how many services were updated, how many kept a hand change,
 * and how many it could not touch.
 *
 * And once, by hand: the three "Live Ens" sessions above are corrected.
 */

create or replace function public.save_service_template(
  p_id uuid,
  p_name text,
  p_start time,
  p_sessions jsonb,
  p_upcoming text default 'keep'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tpl uuid := p_id;
  old_start time;
  old_names text[];
  old_mins int[];
  new_names text[];
  new_mins int[];
  n_new int;
  tz text := public.church_timezone();
  today date := (now() at time zone public.church_timezone())::date;
  svc record;
  ids uuid[];
  names text[];
  mins int[];
  starts timestamptz[];
  first_start timestamptz;
  exact boolean;
  changed boolean;
  hand boolean;
  i int;
  n_svc int;
  updated int := 0;
  kept int := 0;
  untouched int := 0;
begin
  if not public.may(auth.uid(), 'svc.templates') then
    raise exception 'Changing templates is not open to you.' using errcode = '42501';
  end if;
  if p_upcoming not in ('keep', 'all', 'none') then
    raise exception 'Say keep, all or none for the upcoming services.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'A template needs a name.' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Send the sessions as a list.' using errcode = '22023';
  end if;

  select array_agg(btrim(e ->> 'session_name') order by o),
         array_agg((e ->> 'duration_minutes')::int order by o)
  into new_names, new_mins
  from jsonb_array_elements(p_sessions) with ordinality as x(e, o)
  where btrim(coalesce(e ->> 'session_name', '')) <> '';
  n_new := coalesce(cardinality(new_names), 0);

  if tpl is null then
    insert into public.service_templates (name, start_time) values (btrim(p_name), p_start) returning id into tpl;
  else
    select t.start_time into old_start from public.service_templates t where t.id = tpl for update;
    if not found then
      raise exception 'There is no such template.' using errcode = '22023';
    end if;
    select array_agg(session_name order by order_index), array_agg(duration_minutes order by order_index)
    into old_names, old_mins
    from public.service_template_sessions where template_id = tpl;
    update public.service_templates set name = btrim(p_name), start_time = p_start where id = tpl;
    delete from public.service_template_sessions where template_id = tpl;
  end if;

  if n_new > 0 then
    insert into public.service_template_sessions (template_id, order_index, session_name, duration_minutes)
    select tpl, g.k, new_names[g.k], new_mins[g.k] from generate_subscripts(new_names, 1) as g(k);
  end if;

  if p_id is null or p_upcoming = 'none' then
    return jsonb_build_object('id', tpl, 'updated', 0, 'kept', 0, 'untouched', 0);
  end if;

  for svc in
    select s.id, s.date from public.services s
    where s.series_id in (select id from public.service_series where template_id = tpl)
      and s.date >= today
    order by s.date
  loop
    if public.service_has_finished(svc.id)
       or exists (
         select 1 from public.service_sessions x
         where x.service_id = svc.id
           and (x.start_time <= now() or x.held_at is not null or x.skipped_at is not null)
       )
       or not public.may(auth.uid(), 'svc.sessions', null, svc.id) then
      untouched := untouched + 1;
      continue;
    end if;

    select array_agg(id order by order_index), array_agg(session_name order by order_index),
           array_agg(duration_minutes order by order_index), array_agg(start_time order by order_index)
    into ids, names, mins, starts
    from public.service_sessions where service_id = svc.id;
    n_svc := coalesce(cardinality(ids), 0);

    exact := names is not distinct from old_names and mins is not distinct from old_mins
      and (n_svc = 0 or (starts[1] at time zone tz)::time = old_start);
    changed := false;
    hand := not exact;

    if p_upcoming = 'all' or exact then
      -- The template's running order again, row by row, so assignments stay.
      update public.service_sessions set order_index = -order_index where service_id = svc.id;
      for i in 1 .. greatest(n_new, n_svc) loop
        if i <= n_new and i <= n_svc then
          update public.service_sessions
          set order_index = i, session_name = new_names[i], duration_minutes = new_mins[i]
          where id = ids[i];
        elsif i <= n_new then
          insert into public.service_sessions (service_id, order_index, start_time, duration_minutes, session_name)
          values (svc.id, i, now(), new_mins[i], new_names[i]);
        else
          delete from public.service_sessions where id = ids[i];
        end if;
      end loop;
      first_start := (svc.date + p_start) at time zone tz;
      changed := not exact or names is distinct from new_names or mins is distinct from new_mins or old_start is distinct from p_start;
      hand := false;
    else
      -- Only what still says what the template used to.
      for i in 1 .. least(n_svc, coalesce(cardinality(old_names), 0), n_new) loop
        if names[i] = old_names[i] and new_names[i] is distinct from old_names[i] then
          update public.service_sessions set session_name = new_names[i] where id = ids[i];
          changed := true;
        end if;
        if mins[i] = old_mins[i] and new_mins[i] is distinct from old_mins[i] then
          update public.service_sessions set duration_minutes = new_mins[i] where id = ids[i];
          changed := true;
        end if;
      end loop;
      if n_svc > 0 and (starts[1] at time zone tz)::time = old_start and p_start is distinct from old_start then
        first_start := (svc.date + p_start) at time zone tz;
        changed := true;
      else
        first_start := starts[1];
      end if;
    end if;

    -- Start times: the first at its time, each after the one before.
    if first_start is not null then
      update public.service_sessions x
      set start_time = first_start + make_interval(mins => c.before)
      from (
        select id, coalesce(sum(duration_minutes) over (order by order_index rows between unbounded preceding and 1 preceding), 0)::int as before
        from public.service_sessions where service_id = svc.id
      ) c
      where x.id = c.id and x.start_time is distinct from first_start + make_interval(mins => c.before);
    end if;

    if changed then updated := updated + 1; end if;
    if hand then kept := kept + 1; end if;
  end loop;

  return jsonb_build_object('id', tpl, 'updated', updated, 'kept', kept, 'untouched', untouched);
end;
$$;

revoke all on function public.save_service_template(uuid, text, time, jsonb, text) from public, anon;
grant execute on function public.save_service_template(uuid, text, time, jsonb, text) to authenticated;

-- Once: the three Malayalam services made before the template's
-- "Live Ens" was corrected follow it now, as the template always meant.
update public.service_sessions x
set session_name = 'Conclusion | Live End'
from public.services s, public.service_series ser
where x.service_id = s.id and s.series_id = ser.id
  and ser.template_id = '83226ead-6678-4832-a6d9-65feadc39402'
  and s.date >= (now() at time zone public.church_timezone())::date
  and x.session_name = 'Conclusion | Live Ens'
  and exists (
    select 1 from public.service_template_sessions ts
    where ts.template_id = ser.template_id and ts.order_index = x.order_index
      and ts.session_name = 'Conclusion | Live End'
  );

notify pgrst, 'reload schema';

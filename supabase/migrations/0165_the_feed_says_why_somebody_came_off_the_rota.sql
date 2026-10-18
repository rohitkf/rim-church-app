/*
 * The feed says why somebody came off the rota.
 *
 * Answering "Can't make it" takes the person off any role they hold at that
 * service (0092). The rota's feed trigger could not tell that from a Head
 * taking them off by hand, so it wrote the same line either way: "Alfin
 * Ruesvelt took Alfin Ruesvelt off Camera Operator 2", which reads like a
 * deliberate act and says nothing of the answer that caused it.
 *
 * The dropout now says so while it removes the role, and the feed line
 * becomes "came off Camera Operator 2 — can't serve" (or, when somebody
 * marked them unavailable for them, "took Alfin off … — marked them can't
 * serve"). Nothing else about the dropout changes: the role is freed and
 * the team's Head and Assisting Head are told, as before.
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

  -- Said so the feed can tell this from somebody taking them off by hand.
  perform set_config('rim.rota_dropout', 'on', true);
  delete from public.rota_assignments
  where service_id = new.service_id
    and department_id = new.department_id
    and user_id = new.user_id;
  get diagnostics freed = row_count;
  perform set_config('rim.rota_dropout', 'off', true);

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

create or replace function public.activity_from_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  who text;
begin
  if tg_op = 'DELETE' then
    select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
      into who from public.profiles where id = old.user_id;
    perform public.record_activity(
      old.service_id, old.department_id, auth.uid(), 'rota',
      old.role_label,
      case
        -- Their own "can't make it" took them off: the answer, not a hand.
        when coalesce(current_setting('rim.rota_dropout', true), '') = 'on' and auth.uid() = old.user_id
          then 'came off, can''t serve'
        -- Somebody marked them unavailable for them.
        when coalesce(current_setting('rim.rota_dropout', true), '') = 'on'
          then coalesce(nullif(who, ''), 'someone') || ' off, marked can''t serve'
        else coalesce(nullif(who, ''), 'someone') || ' taken off'
      end
    );
    return old;
  end if;

  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into who from public.profiles where id = new.user_id;
  perform public.record_activity(
    new.service_id, new.department_id, auth.uid(), 'rota',
    new.role_label, coalesce(nullif(who, ''), 'someone') || ' assigned'
  );
  return new;
end;
$function$;

notify pgrst, 'reload schema';

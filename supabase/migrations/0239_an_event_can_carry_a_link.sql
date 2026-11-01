-- An event can carry a link: the Zoom meeting, the sign-up form.
--
-- People pasted the link into "Anything else", where it sat among the
-- passcode and the notes. A field of its own lets the event card put it
-- behind a button. Only a web address (http or https) is kept: anything
-- else, a javascript: one above all, is refused rather than made tappable.
-- A repeating series (0235) carries it too, so each time it makes has it.

alter table public.church_events add column if not exists link text;
alter table public.church_event_series add column if not exists link text;

alter table public.church_events drop constraint if exists church_events_link_is_a_web_address;
alter table public.church_events add constraint church_events_link_is_a_web_address
  check (link is null or (link ~* '^https?://[^[:space:]]+$' and length(link) <= 2000));
alter table public.church_event_series drop constraint if exists church_event_series_link_is_a_web_address;
alter table public.church_event_series add constraint church_event_series_link_is_a_web_address
  check (link is null or (link ~* '^https?://[^[:space:]]+$' and length(link) <= 2000));

-- The nightly fill (0235–0237), now carrying the link to every event it makes.
create or replace function public.extend_event_series(only_series uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.church_event_series%rowtype;
  horizon date := current_date + 183;
  on_date date;
  n int;
  made int := 0;
begin
  if only_series is not null and auth.uid() is not null then
    select * into s from public.church_event_series where id = only_series;
    if not found then raise exception 'That repeating event has gone.'; end if;
    if not public.may_for_every_team(auth.uid(), 'svc.events', s.department_ids) then
      raise exception 'Changing that event is not open to you.' using errcode = '42501';
    end if;
  end if;

  for s in
    select * from public.church_event_series
    where stopped_at is null and (only_series is null or id = only_series)
    for update
  loop
    n := 0;
    loop
      on_date := public.event_series_date(s.anchor_date, s.rule, n);
      exit when on_date > horizon or n > 2000;
      if on_date > s.generated_through and on_date >= current_date
         and not exists (select 1 from public.church_events e where e.series_id = s.id and e.event_date = on_date) then
        insert into public.church_events
          (title, details, event_date, ends_on, start_time, end_time, location, link, department_id, department_ids,
           created_by, series_id, repeat_rule)
        values
          (s.title, s.details, on_date, case when s.run_days > 0 then on_date + s.run_days end,
           s.start_time, s.end_time, s.location, s.link, s.department_id, s.department_ids,
           s.created_by, s.id, s.rule);
        made := made + 1;
      end if;
      n := n + 1;
    end loop;

    update public.church_event_series
    set generated_through = greatest(generated_through, horizon)
    where id = s.id;
  end loop;
  return made;
end;
$$;

revoke all on function public.extend_event_series(uuid) from public, anon;
grant execute on function public.extend_event_series(uuid) to authenticated;


notify pgrst, 'reload schema';

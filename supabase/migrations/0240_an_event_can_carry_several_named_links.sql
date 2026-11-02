-- An event can carry several links, each with a name to show.
--
-- One link (0239) was a Zoom meeting or a sign-up form, never both, and
-- its button could only say "Open link". Now an event has links: a list
-- of { "label": "Join on Zoom", "url": "https://…" }, each its own button,
-- labelled with its name (or "Open link" when it has none).
--
-- link stays, as the first of them, for builds that only know the one: a
-- trigger keeps the two in step, as department_id is kept with
-- department_ids (0237). Every address in the list is a web address
-- (http or https), as link's own check already says.
--
-- A repeating series (0235) carries them too.

create or replace function public.event_links_ok(links jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(links) = 'array'
     and jsonb_array_length(links) <= 10
     and not exists (
       select 1 from jsonb_array_elements(links) l
       where jsonb_typeof(l) <> 'object'
          or jsonb_typeof(l -> 'url') <> 'string'
          or not ((l ->> 'url') ~* '^https?://[^[:space:]]+$' and length(l ->> 'url') <= 2000)
          or (l ? 'label' and jsonb_typeof(l -> 'label') not in ('string', 'null'))
          or length(coalesce(l ->> 'label', '')) > 80
     )
$$;

alter table public.church_events add column if not exists links jsonb not null default '[]'::jsonb;
alter table public.church_event_series add column if not exists links jsonb not null default '[]'::jsonb;

update public.church_events
set links = jsonb_build_array(jsonb_build_object('label', null, 'url', link))
where link is not null and links = '[]'::jsonb;
update public.church_event_series
set links = jsonb_build_array(jsonb_build_object('label', null, 'url', link))
where link is not null and links = '[]'::jsonb;

alter table public.church_events drop constraint if exists church_events_links_are_web_addresses;
alter table public.church_events add constraint church_events_links_are_web_addresses check (public.event_links_ok(links));
alter table public.church_event_series drop constraint if exists church_event_series_links_are_web_addresses;
alter table public.church_event_series add constraint church_event_series_links_are_web_addresses check (public.event_links_ok(links));

/*
 * The list and its first address, kept in step. A build that writes only
 * link gets a list of one (or none); link is always the list's first url.
 */
create or replace function public.event_links_in_step()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (new.links is null or new.links = '[]'::jsonb) and new.link is not null then
      new.links := jsonb_build_array(jsonb_build_object('label', null, 'url', new.link));
    end if;
  elsif new.links is not distinct from old.links and new.link is distinct from old.link then
    -- Only the one link changed: that build's whole answer.
    new.links := case when new.link is null then '[]'::jsonb
                      else jsonb_build_array(jsonb_build_object('label', null, 'url', new.link)) end;
  end if;
  new.links := coalesce(new.links, '[]'::jsonb);
  new.link := new.links -> 0 ->> 'url';
  return new;
end;
$$;

drop trigger if exists church_events_links_in_step on public.church_events;
create trigger church_events_links_in_step
  before insert or update of link, links on public.church_events
  for each row execute function public.event_links_in_step();

drop trigger if exists church_event_series_links_in_step on public.church_event_series;
create trigger church_event_series_links_in_step
  before insert or update of link, links on public.church_event_series
  for each row execute function public.event_links_in_step();

-- The nightly fill (0235–0239), now carrying the links to every event it makes.
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
          (title, details, event_date, ends_on, start_time, end_time, location, link, links, department_id, department_ids,
           created_by, series_id, repeat_rule)
        values
          (s.title, s.details, on_date, case when s.run_days > 0 then on_date + s.run_days end,
           s.start_time, s.end_time, s.location, s.link, s.links, s.department_id, s.department_ids,
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

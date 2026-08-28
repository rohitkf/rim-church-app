-- ============================================================================
-- A checklist tick and a checklist un-tick are not the same event
-- ============================================================================
-- The first version of this trigger named the stage an item had arrived at,
-- which reads correctly going forwards ("ticked", "verified", "signed off")
-- and nonsensically coming back ("pending Clean Lens"). Undoing something is
-- exactly the event a feed exists to show, so it needs its own words.
--
-- The direction is the whole fix: compare the stage it left with the stage
-- it reached. Going up names what was just done; coming down names what was
-- just taken away — and the stage that *was lost* is the one worth naming,
-- because "removed the sign-off" is the fact, not "is now head verified".
--
-- The detail stays a bare token. The sentence is built in
-- frontend/src/lib/activity.ts, so re-wording it never needs a migration.

create or replace function public.checklist_stage_rank(s public.checklist_item_status)
returns integer
language sql
immutable
as $$
  select case s
    when 'member_complete' then 1
    when 'head_verified' then 2
    when 'coordinator_verified' then 3
    else 0
  end;
$$;

create or replace function public.activity_from_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  item_label text;
  was integer;
  now_at integer;
  word text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  was := public.checklist_stage_rank(case when tg_op = 'UPDATE' then old.status else 'pending' end);
  now_at := public.checklist_stage_rank(new.status);
  if was = now_at then
    return new;
  end if;

  if now_at > was then
    -- Forwards: name the stage just reached.
    word := case now_at when 1 then 'ticked' when 2 then 'verified' else 'signed_off' end;
  else
    -- Backwards: name the stage just given up, which is the news.
    word := case was when 3 then 'unsigned' when 2 then 'unverified' else 'unticked' end;
  end if;

  select service_id, department_id, role_label into a
  from public.rota_assignments where id = new.assignment_id;
  select label into item_label
  from public.department_role_checklist_items where id = new.item_id;

  perform public.record_activity(
    a.service_id, a.department_id, auth.uid(), 'checklist',
    coalesce(item_label, a.role_label), word
  );
  return new;
end;
$$;

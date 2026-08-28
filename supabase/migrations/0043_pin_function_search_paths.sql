-- ============================================================================
-- Pin the two functions that were left with a mutable search_path
-- ============================================================================
-- Supabase's database linter flags any function that does not fix its own
-- `search_path`. Both of these are SECURITY INVOKER, so the risk is small —
-- they run as whoever called them, not as the owner — but a function that
-- resolves its names against whatever schema happens to be first is a
-- function whose behaviour depends on the caller's settings, and that is
-- worth closing whatever the blast radius.
--
-- `checklist_stage_rank` is from 0042 and the omission was mine.
-- `touch_updated_at` has been there since 0001.

create or replace function public.checklist_stage_rank(s public.checklist_item_status)
returns integer
language sql
immutable
set search_path = public
as $$
  select case s
    when 'member_complete' then 1
    when 'head_verified' then 2
    when 'coordinator_verified' then 3
    else 0
  end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

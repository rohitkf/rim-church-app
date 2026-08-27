-- ============================================================================
-- Fix the running-order cascade's exponential recursion
-- ============================================================================
-- recalculate_session_chain() walks every later session and UPDATEs its
-- start_time — and those UPDATEs re-fired the very same AFTER UPDATE
-- trigger, which walked the rest of the list again, and so on. Cost grew
-- as 2^n: a 12-session order took ~150ms, 18 sessions took over three
-- minutes, so editing a time (or adding/deleting a session, or moving the
-- service's date) on a realistic running order hung the request.
--
-- Two guards fix it:
--   * only fire at the top level (pg_trigger_depth() < 1), so the cascade
--     runs exactly once per user action and updates each later row once
--   * on UPDATE, only fire when a value the chain depends on actually
--     changed, so no-op writes cost nothing
-- The function body is unchanged — one pass already computes the whole
-- chain correctly; it was only the re-entry that was wasteful.
drop trigger if exists service_sessions_recalculate_chain on public.service_sessions;

create trigger service_sessions_recalculate_chain_insert
  after insert on public.service_sessions
  for each row
  when (pg_trigger_depth() < 1)
  execute function public.recalculate_session_chain();

create trigger service_sessions_recalculate_chain_update
  after update of start_time, duration_minutes on public.service_sessions
  for each row
  when (
    pg_trigger_depth() < 1
    and (
      old.start_time is distinct from new.start_time
      or old.duration_minutes is distinct from new.duration_minutes
    )
  )
  execute function public.recalculate_session_chain();

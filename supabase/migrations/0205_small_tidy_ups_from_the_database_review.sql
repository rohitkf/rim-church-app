/*
 * Two tidy-ups from the database review.
 *
 * stage_layouts had two indexes on service_id: the unique
 * stage_layouts_one_per_service, which is what keeps a service to one
 * layout, and a plain stage_layouts_service_idx that answered nothing the
 * unique one does not. The plain one goes.
 *
 * Ten functions ran with whatever search_path the caller had. None
 * of them is security definer, so this was never a way in, but a function
 * that resolves names by the caller's path can be pointed at something
 * else by anyone who can create a same-named object earlier on it. They
 * use only built-ins (and auth.uid(), already qualified), so each is pinned
 * to an empty path: pg_catalog is always searched first regardless.
 */

drop index if exists public.stage_layouts_service_idx;

alter function public.assignment_carries_phase(boolean, boolean, text) set search_path = '';
alter function public.clock_in_audience_is_valid(jsonb) set search_path = '';
alter function public.metres_between(double precision, double precision, double precision, double precision) set search_path = '';
alter function public.overwatch_pages_is_valid(jsonb) set search_path = '';
alter function public.page_access_is_valid(jsonb) set search_path = '';
alter function public.planner_controls_is_valid(jsonb) set search_path = '';
alter function public.prayer_snippet(text) set search_path = '';
alter function public.series_date(date, text, integer) set search_path = '';
alter function public.stage_block_lock_guard() set search_path = '';
alter function public.stage_block_stamp() set search_path = '';

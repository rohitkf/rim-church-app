/*
 * Three functions say where they look.
 *
 * A whole-app check (November 2026) asked the database's own adviser what
 * it thought. Of everything it lists, one notice was a thing left undone
 * rather than a thing chosen: three functions with no search_path of
 * their own, so that what an unqualified name inside them means is
 * whatever the caller's search_path says at the time.
 *
 *   call_time_day(date)               the date as a call time says it
 *   joining_form()                    the number of the joining form
 *   notifications_collect_for_push()  the trigger that gathers new
 *                                     notification ids for the sender
 *
 * None of them is security definer, and none names a table of the
 * app's: to_char, string_agg, set_config, current_setting and a
 * trigger's own transition table (`new_rows`, which is found by name
 * before any schema is searched). So there was nothing here to exploit,
 * and nothing changes in what they do — every other function in the
 * schema already pins its path, and these three now do too. An empty
 * path: pg_catalog is always searched, and that is all they use.
 */

alter function public.call_time_day(date) set search_path = '';
alter function public.joining_form() set search_path = '';
alter function public.notifications_collect_for_push() set search_path = '';
select public.migration_done(311, '0311_three_functions_say_where_they_look', 'ad3da39d8dc1489f27488bf4d74ec90d6ff10e280d4cf37e8161ed4a05dfc5a5');

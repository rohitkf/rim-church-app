/*
 * The session's own two columns go.
 *
 * `0093` moved who is taking a session into rows of its own and left
 * `assigned_user_id` and `guest_id` where they were, because the frontend
 * deployed at that moment still read them. Nothing reads them now: the
 * planner, the export and the assistant all work off
 * `service_session_assignees`.
 *
 * Leaving them would be worse than dropping them. They hold what was true
 * the day `0093` ran and nothing has kept them up to date since, so the
 * first person to trust them would be told a name that was replaced weeks
 * ago — and this repository already carries an apology in its own source
 * for two lists that fell out of step.
 *
 * Apply this only once the deploy carrying `0093`'s frontend is live.
 */

alter table public.service_sessions
  drop constraint if exists service_sessions_one_lead;

alter table public.service_sessions
  drop column if exists assigned_user_id,
  drop column if exists guest_id;

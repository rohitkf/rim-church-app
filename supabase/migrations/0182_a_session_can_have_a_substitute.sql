/*
 * A session can have a substitute.
 *
 * Whoever is taking a session (0093) sometimes cannot: they are ill, held
 * up, called away. The planner can now name who steps in, ahead of time,
 * beside who was asked — as many as it takes, members or guests, exactly
 * as the people taking it are named.
 *
 * A substitute is one more row on `service_session_assignees`, marked
 * `is_substitute`. Everything already there is somebody taking the
 * session, so the column defaults to false and nothing changes until a
 * planner adds one. The rows keep their own `order_index` within each of
 * the two lists.
 *
 * Nobody is both: the indexes that keep a person on a session once
 * (0093) still hold across the two lists, so moving somebody from taking
 * it to standing by is a remove and an add, never two rows for one
 * person. Who may write them is the same rule as before — the session's
 * own (`svc.sessions`, 0134), until the service is over.
 */

alter table public.service_session_assignees
  add column if not exists is_substitute boolean not null default false;

comment on column public.service_session_assignees.is_substitute is
  'True for somebody named to step in if the person taking the session cannot. Shown apart from them on the planner and the sheet.';

-- A service can carry a link: the livestream, the slides, the shared folder.
--
-- The Owner asked for one place to put the link that goes with a service,
-- so it shows on the service's card on the Dashboard and at the top of its
-- running order. Until now it was pasted into a board post or a session's
-- name, where it could not be tapped from either.
--
-- Two columns on the service itself: the address, and what to call it
-- ("Livestream"); without a name the app says "Open link". The address is
-- held to the same rule as an event's link (0239): http(s) only, so a
-- field typed by one person and read by the whole church never carries a
-- script.
--
-- Who may set it is not a new rule. services_write_update (0200) already
-- asks may('svc.manage'), and the planner-buttons guard (0184) refuses any
-- column but ended_at to somebody who only holds a planner button, so the
-- link is the planner's to set and nobody else's. Everybody who can read
-- the service reads its link.
--
-- Compatible with the app already in production: it reads services with
-- select('*') and ignores columns it does not know.

alter table public.services add column if not exists link text;
alter table public.services add column if not exists link_label text;

alter table public.services drop constraint if exists services_link_is_a_web_address;
alter table public.services add constraint services_link_is_a_web_address
  check (link is null or (link ~* '^https?://[^[:space:]]+$' and length(link) <= 2000));

alter table public.services drop constraint if exists services_link_label_is_short;
alter table public.services add constraint services_link_label_is_short
  check (link_label is null or (length(btrim(link_label)) between 1 and 40 and link is not null));

select public.migration_done(289, '0289_a_service_can_carry_a_link', 'be94c611d55d6ffb6e11654a73d59dc4c2bfeb5c5bae5660442ceecf7c4477e9');

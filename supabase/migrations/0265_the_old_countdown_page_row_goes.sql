/*
 * The old row for opening the Countdown goes (follows 0264).
 *
 * 0264 gave the page its own row, countdown.view, and carried the church's
 * choices across; the app reads that one now. page.countdown (0261) is
 * read by nothing, so it goes, its saved cells with it (on delete cascade).
 *
 * Applied only once the release that reads countdown.view is live: the
 * one before it asked page.countdown, and without the row it would have
 * fallen back to its default and opened the page to every Team Member.
 */
delete from public.permission_grants where capability = 'page.countdown';
delete from public.permission_catalog where capability = 'page.countdown';

notify pgrst, 'reload schema';

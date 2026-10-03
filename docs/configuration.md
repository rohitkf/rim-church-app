# Configuring the app from Settings

What an Admin can change, where it is stored, and what enforces it. This is the
design note for migration 0123 and the Settings rooms built on it. Keep it
current when a new setting is added.

## The principle

Everything a church might reasonably disagree with us about is a setting, not
a constant. But a setting has to be **honest about what it does**. There are
two kinds, and the Settings pages say which one each control is:

| Kind | Stored in | Who obeys it | Example |
|---|---|---|---|
| **A rule** | a typed `app_settings` column, with a check constraint | the database — RLS policies and nightly jobs read it | who may read the message board; how long chat is kept |
| **A preference for the screens** | `app_settings.display` (jsonb, validated by `lib/display.ts`) | only the app's pages | how many service days the Dashboard lists; whether Finished starts open |

A rule changed in Settings changes what the API returns. A display preference
changes only what is drawn. The Access room marks every page **Enforced by the
database** or **Hides the page**, so nobody mistakes the second for the first.

Admins (and the Owner) can always open everything. No setting can lock an Admin
out of a page, because an Admin is how a wrong setting gets put right.

## 1. Profiles and pages — `app_settings.page_access`

Four profiles, the same four "View as" previews:

| Level | Who |
|---|---|
| `everyone` | anybody signed in — a Church Member and up |
| `team` | on at least one team (member, Head or Assisting Head) |
| `leads` | Head or Assisting Head of any team |
| `admins` | Admins and the Owner only |

`page_access` maps a page key to the lowest level that may open it. A missing
key means the page's default. Each page allows only the levels the database can
actually honour (`PAGE_RULES` in `lib/pageAccess.ts`, mirrored by
`page_access_is_valid()` in SQL):

| Page | Default | Choices | Enforced by |
|---|---|---|---|
| Dashboard | everyone | fixed | — (where everybody lands) |
| Service Planner | everyone | everyone · team · leads | the page (services also feed the Dashboard) |
| Availability | team | fixed | the page and the database (you answer for your team) |
| Team Rota | team | everyone · team | the database (`rota_assignments`, call times, readiness) — opening it is a widening only, because other team pages read the same rows |
| Checklists | team | fixed | the database |
| Set Lists | everyone | everyone · team · leads | the page |
| Debriefs | team | team · leads | the database (`service_debriefs`, items) |
| Issues | — | set by "Who can raise one" in Timings | the database (`may_raise_issue`) |
| Messages | team | everyone · team · leads | the database (`messages`) |
| Team Chat | team | fixed | the database (it is per team) |
| Church Updates | everyone | everyone · team · leads | the database (`church_updates`) |
| Polls | everyone | everyone · team | the database (`team_polls` and its options and votes) |
| Events | everyone | everyone · team · leads | the database (`church_events`) |
| Giving | everyone | everyone · team · leads | the database (the three giving tables) |
| Teams | everyone | everyone · team | the page |
| Volunteers | admins | fixed | the database (roles and sensitive details are Admin-only) |
| Inventory | team | team · leads | the database (the four inventory tables) |

SQL: `page_level(text)`, `is_a_lead(uuid)`, `can_open_page(uuid, text)`. The
affected SELECT policies call `can_open_page` through a sub-select so it is
evaluated once per query, not once per row. With every key at its default,
each rewritten policy returns exactly the rows it returned before (dry-run in
0123's notes).

On the screen: `NAV_ITEMS` entries carry a `page` key instead of
`teamOnly`/`adminOnly`; the menu, the dock, the search and the route guard
(`PageRoute`, which replaces `TeamOnlyRoute`) all ask `canOpenPage()`.

## 2. How long things are kept — retention columns

Nullable integer days; `null` means **kept for ever**, which is the default for
every new one, so applying 0123 deletes nothing. One nightly job,
`apply_retention()` (cron `apply-retention`, 03:00 UTC), does the deleting.

| Column | What goes | Existing? |
|---|---|---|
| `board_clear_dow` | the message board and the activity feed, weekly | yes |
| `debrief_retention_days` | debrief minutes, from the service date | yes |
| `issue_retention_days` | resolved issues, from when they were marked | yes |
| `notification_retention_days` | bell notifications older than this | new |
| `team_chat_retention_days` | team chat posts older than this | new |
| `church_update_retention_days` | unpinned Church Updates older than this | new |
| `poll_retention_days` | polls this long after they closed (or were made, if they never close) | new |
| `alert_retention_days` | sent alerts' record (`announcements`) | new |

Each has its sentence in `lib/lifespan.ts`, so the page that loses things says
so.

## 3. Display preferences — `app_settings.display`

One jsonb object; every key optional, every key has a default in
`DISPLAY_DEFAULTS`, unknown keys are ignored, so an old app and a new row (or
the reverse) never break each other.

| Key | Default | What it changes |
|---|---|---|
| `dashboard.serviceDays` | 1 | how many service days ahead the Dashboard lists |
| `dashboard.openNext` | `auto` | the next service's card: `auto` (open on the day), `always`, `never` |
| `dashboard.show.*` | all on | Today's events, Teams ready, Readiness, Availability, Turnout, Activity |
| `lists.upcomingOpen` | false | Upcoming services start open, on every service page |
| `lists.finishedOpen` | false | Finished services start open (a page still opens it when something in it can be written to) |
| `windows.setListDays` | 21 | how far ahead Set Lists looks |
| `windows.debriefAheadDays` | 21 | how far ahead Debriefs lists services |
| `windows.availabilityDays` | 21 | how far ahead Availability asks |
| `windows.diaryPastDays` | 365 | how far back Events keeps past events on screen |
| `windows.invitationStaleDays` | 14 | when an unanswered invitation reads as stale |

## 4. Where it lives in Settings

| Room | Holds |
|---|---|
| Access & privileges | **Pages** (who can open each, with a live preview of each profile's menu) · **Rules** (the reference grid, now reflecting the Pages choices) |
| Timings | when things open and close (unchanged, minus clean-up) |
| Data & retention | every clock in §2 |
| Dashboard & lists | everything in §3 |
| Team Rota · Giving · Menu | unchanged |

Each room saves only its own columns (`useSettingsDraft(keys)`), so two Admins
in two rooms can never undo each other's changes — the bug the old whole-row
save had to dodge for `coordinator_color`.

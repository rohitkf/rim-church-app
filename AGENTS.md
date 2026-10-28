# AGENTS.md

Instructions for anyone — person or coding agent — working in this
repository. `CLAUDE.md` points here rather than repeating it: one copy, so
there is nowhere for a second, wrong copy to live.

Keep this file current in the same pull request that changes what it says.

---

## 1. Branches

- Work on **`develop`**. Only `develop`.
- **Never create a branch.** No feature branches, no `claude/*`, no scratch
  branches. If one seems necessary, ask first.
- **Never push to `main`.** It is protected and it moves only by a pull
  request from `develop`.
- **When the work is implemented and verified, open the pull request to
  `main` — every time, without being asked.** "Verified" means the four
  commands in §2 are clean and, for anything a person sees, `/verify` has
  been run on the built app. The PR merges itself once CI is green and
  Vercel deploys it, so say that in the PR body, what was and was not
  checked, and which migrations or functions it depends on. Then watch it
  to merged and deployed. If a PR from `develop` is already open, new
  commits ride it; do not open a second.
- Opening the PR is the only thing that is pre-approved. **Applying a
  migration to production, deploying an edge function, and sending
  anything to real people still each need the user's explicit yes for
  that action**, as before.
- **But not before the database is ready.** The PR merges itself and
  deploys, so a frontend that needs a migration or a redeployed function
  must not be put up for merge until that migration is applied (with the
  user's yes) and that function deployed. The other order shipped Stage
  Layout to every phone as *"Could not find the table
  'public.stage_layouts'"* (October 2026). Push to `develop`, get the yes,
  apply, **then** open the PR — and say in it that the migration is
  already live.
- A merged pull request is finished. Follow-up work is a new PR.

## 2. Commands

Run from `frontend/`. All four must be clean before you push:

```bash
npx tsc --noEmit -p tsconfig.app.json    # the app
npx tsc --noEmit -p tsconfig.node.json   # vite.config.ts and build/
npx vitest run                           # ~865 tests, all must pass
npm run build                            # catches what tsc alone misses
```

CI (`.github/workflows/ci.yml`) runs the same checks, split for speed:
`frontend` (lint + build), `frontend tests (1/4)`…`(4/4)` (vitest
`--shard`), `migrations`, and `backend` / `docker` only when their own
files (or CI itself) change — `changes` works that out, and a skipped job
counts as green for auto-merge. Keep the job names: auto-merge and any
required check read them. A newer push cancels the older run of the same
event and ref.

`npm run lint` (oxlint) exits 0 with ~40 standing warnings. Do not add to
them; do not fix unrelated ones in a PR about something else.

Backend (`backend/`, FastAPI, AI assistant only): `pytest`.

Single test file: `npx vitest run src/path/to/file.test.tsx`.

---

## 3. What this app is, in its own words

A church runs Sunday services. Volunteers are on **teams**; each team fills
**roles** at a **service**; who does what is the **rota**; each role has a
**checklist** to work through on the day.

**Vocabulary that differs between the database and the screen** — this is
the thing most likely to waste your time:

| In the database | On the screen |
|---|---|
| `departments` | **Teams** |
| `department_members` | who is on a team — `core` or `guest` |
| `permission_roles`, `permission_catalog`, `role_permissions`, `department_permissions` | who may do what: six profiles (Admin, Team Head, Assisting Head — its own column since 0162 — Coordinator, Team Member, Church Member), what each can be given, the church's own choices, and one team's own choices (0162: no wider than the team; `may(uid, cap, dept)` reads the team's cell for `dept` first). Settings › Page by Page (a page at a time, team by team), or Access & Privileges (by role, or by page-opening rule) |
| `department_guests` | the guest roll's people on a team, `core` or `guest`, until they sign up: linking a guest to an account (`guests.became_member`) moves their rows into `department_members` (0161). Their availability answers are given for them and kept apart in `guest_availability` (+ `guest_availability_history`, 0166), and their rota roles in `guest_rota_assignments` (0167: one role per service, never Team Coordinator, no checklist or tags; the rota page reads both, keyed `guest:<id>` — lib/guestRota). Both move onto the account at sign-up; reminders, readiness, polls, checklists and late-answer asks read `rota_assignments`/`availability` and so count account holders only |
| `user_roles.role_type` | `admin`, `department_head`, `assisting_head`, `service_flow_coordinator`, `overwatch` |
| `role_type = 'overwatch'` (0186, 0187) | **Overwatch** — sees every team as an Admin does (`can_view_department_content` / `may_read_team` say yes, and the reads that ask other things have an `*_overwatch_read` policy beside theirs), changes almost nothing: no column in the grid, so `may()` gives it nothing. It may do five things, each an `app_settings` switch (`overwatch_board_posts`, `_chat_posts`, `_polls`, `_issues`, `_debriefs`) read by `overwatch_may()`, and opens the pages `app_settings.overwatch_pages` leaves open (page → open; Volunteers starts closed) through `can_open_page` / `overwatch_sees()`. Its issues carry `raised_as_overwatch`; its debrief is the one with `department_id` null (one per service, `unique nulls not distinct`). Given from Volunteers (Admins), set in Settings › Overwatch. On screen `seesAllTeams` (Admin or Overwatch) is for what is drawn only — never for what may be changed. Contacts, compliance and households stay the Owner's |
| `services` → `service_sessions` | a service and its running order |
| `app_settings.planner_controls` (0184) | the planner's **buttons given to a team or a person** — `{teams: {dept: [control]}, people: {profile: [control]}}`, controls `start` `hold` `add_time` `skip` `substitute` `add_below` `remove` `end`. Whoever has `svc.sessions` (or `svc.manage`, for End service) has them all; this only adds. Edited in Settings › Page by Page › Service Planner (`PlannerControlsCard`); read by `planner_control(variadic text[])` in the policies, and by `usePlannerControls` to draw the menu. A guard trigger on `service_sessions` and on `services` refuses any column outside what the holder's buttons write (a holder of Add time cannot rename a session) |
| `service_session_assignees` | who is taking a session — a list, one row per person. `is_substitute` (0182) marks whoever steps in if they cannot: a second list on the same rows, from the session's ⋯ › Assign substitute, drawn apart (amber, dashed, Sub) on the planner, its Preview and the exported sheet. `peopleOn` is the people taking it only; `substitutesOn` the rest. A person is on a session once, in one list |
| `announcements` | the alert an Admin sends from Settings |
| `team_messages` (`kind='alert'`) | a team alert |
| signed in, on no team (`is_on_a_team` false) | a **Church Member** |
| `rota_tags`, `rota_assignment_tags` | the rota's tags — Shadow and the church's own |
| `giving_page`, `giving_links`, `giving_bank_accounts` | the **Giving** page (Tithes & offerings) |
| `team_polls` (`audience`: everyone · team · people · service; `anonymous`, 0172) | the **Polls** page — any audience, not only a team. On an anonymous poll the vote rows reach only their own voter and the Owner (plus Admins, or Admins and the team's Heads, by `app_settings.poll_voters_seen_by`); everybody reads the counts through `poll_tallies()`. Changed or deleted only by its asker, an Admin (the Owner included, 0177), or — for a poll with a `department_id`, while `app_settings.poll_managed_by` is `leads` (the default) — that team's Head or Assisting Head, who also always see it (0179, 0181). `poll_top_count` / `poll_top_seen_by` (0181) lift and mark a poll's most-picked options on screen only (`topOptions` in `lib/polls.ts`); the counts are everybody's anyway. `include_guests` / `guest_ids` (0177): a guest is somebody in the audience only through a guest place on a team (`poll_person_is_guest`); false leaves them all out, a list asks only those, null asks every guest. Who sees it and who is told are both `poll_admits` inside `poll_is_for_me` and `poll_recipients` |
| `my_open_requests()` (0178) | the dashboard's **reminders** — what is waiting on the caller (an unanswered poll, availability not given, an unread mention), worked out from the things themselves so it goes when answered. An availability ask for a later day waits while any of today's services has not ended (`service_ended_at`, 0183). Shown by `components/ReminderBanner` |
| `church_updates` | the **Church Updates** page |
| `app_feedback` (`kind`, `status`) | the **Feedback** page — about the app, not a Sunday; sent via `submit_feedback`, read and answered by the Owner alone via `mark_feedback` (0124, 0125) |
| `stage_areas` → `stage_layouts` → `stage_blocks`, `stage_comments`, `stage_layout_log` | the **Stage Layout** page — one workspace per service, the areas (Stage, Audience, …) as regions of it, a block in one region (a block can be a row of seats, or an item drawn as a line picture — `kind = 'item'`, `icon` a key from `lib/stageIcons.ts`, 0160 — and its corners are sharp unless set rounded; an Admin can lock one, and then nobody — the Admin included — moves, edits or deletes it until it is unlocked; others ask to move it through `stage_move_requests`, and a template or a clear over a locked block is refused, 0157 and 0159); who may draw is per team in `stage_team_access` (`stage_may()`, Settings › Stage Layout, 0155); the log is trigger-written; `stage_templates` kept, `stage_template_requests` for an Admin to answer |
| `service_issues` | the **Issues** page — raised via `raise_issue` inside `issue_window` (Heads and Admins exempt, 0119), a Head's verdict (`outcome`, `remarks`) via `mark_issue` (0117–0119) |

Other things that are true and not guessable:

- **A "finished" service is computed, never stored.** It is finished when
  its last session's end time has passed (`lib/useFinishedServices.ts`,
  `lib/serviceProgress.ts`). Nothing sets a flag. After a grace period
  (`app_settings.edit_grace_minutes`) the database itself refuses edits.
  The one exception is the **"After the service" half of a checklist**,
  which has its own window around the end: it opens
  `app_settings.after_service_checklist_opens_minutes` before it (default
  20, 0147) and closes `after_service_checklist_minutes` after it (default
  120, 0115), both in `checklist_item_writable`, Admins included. A
  service with no end time keeps it shut until End service is pressed.
  The page keeps such a service out of Finished until that closes.
- **A checklist item climbs a fixed chain**, and the order never changes:
  `pending` → `member_complete` → `head_verified` → `coordinator_verified`
  (the `checklist_item_status` enum, mirrored 1:1 by the `status-*` colour
  tokens). A new stage means a new token, never a reused accent.
- **Head and Assisting Head are identical in every rule.** Do not write a
  policy that distinguishes them.
- **The Team Coordinator is a rota role, not a rank.** Whoever holds it for
  a service can sign that service's checklists off, and only then.
- **Who opens which page is the church's choice, within limits the
  database can honour** (0123, `docs/configuration.md`). Each page in
  `lib/pageAccess.ts` `PAGE_RULES` has a default and the levels it may be
  set to — `everyone`, `team`, `leads` (Heads), `admins` — stored in
  `app_settings.page_access`. Admins always may. Out of the box a Church
  Member sees the church's shape, not its teams' working: Dashboard,
  Service Planner, Events, Set Lists, Giving, Church Updates, Polls (the
  ones addressed to them) and Teams (to ask to join one). Gated routes sit
  behind `PageGate`; the menu, search and gate all ask `usePageAccess()`.
  The tables follow too: their select policies call `can_open_page(uid,
  page)` (the rota's only widen — Availability and Checklists read the
  same rows). `page_access_is_valid()` in SQL and `PAGE_RULES` must agree;
  `pageAccess.test.ts` reads the migration and checks. A new team-only
  table that reads `auth.uid() is not null` leaks to Church Members — give
  it `can_open_page` or `is_on_a_team`.
- **Rota tags are labels, never exemptions.** A tagged assignment is
  still that person's one role at the service.
- **No payment passes through the app.** Giving links open the provider's
  page; links must be `https://` in the database as well as the form.
- **"View as" is a preview of the screens, not of the data.** An Admin can
  preview the app as a Church Member, Team Member or Team Head from the
  account menu (`viewAs` in `AuthContext`); it narrows `isAdmin`, `roles`
  and `useMyTeams`, but every query still runs with the Admin's own
  access. Never treat it as a permission test — dry-run a policy instead.
  Which teams a person is on comes from `useOwnMemberships` (or
  `useMyTeams`), never a page's own `department_members` query by the
  signed-in id: that one ignores the preview, and is how a Church Member
  preview showed the Admin's own teams' "3 still to answer".
- **Whether a service is over is one rule** — `useFinishedServices` (and
  `serviceStanding` with `ended_at`): the planned end of its last session,
  or End service if pressed earlier. Never re-derive it from sessions alone
  on a page; that is how pages disagreed with the planner.
- **What clears, and when, is said on the page** by `<Lifespan page=…>`,
  worded once in `lib/lifespan.ts` from App settings. A new clock (a cron
  job, a lock, a retention period) needs its sentence there too.
- **Every page that lists services uses the same four sections** —
  Today's services (only services dated today, only on the day), Next
  service (the whole nearest service day after today), Upcoming services
  and Finished services (both folded until opened) — from
  `lib/serviceSections` and `components/ServiceSections`. A service moves
  to Finished when it is done *on that page* (most pages: when it ends;
  Issues: when entry closes; Debriefs: when the team's window closes).
  Finished arrives open while something in it can still be written to (a
  checklist's after-half, last night's debrief). Don't build a page's own
  grouping.
- **A day with several services is one date heading** (`DayHeading`,
  `serviceDays`), services in start-time order (`inStartOrder`); a
  Finished list is newest day first but each day still in running order.
- **Before pushing a change that touches several pages**, run the
  whole-app sweep: `frontend/.claude/skills/verify/sweep.mjs`.
- **Pages show a window of days, not "the next N services"**
  (`app_settings.rota_window_days`, `lib/rotaWindow.ts`).

## 4. Where things are

```
frontend/src/
  components/Surface.tsx     the design system's primitives — start here
  components/Select.tsx      the app's dropdown (never use a native <select>)
  components/DateTimeFields  DateField / TimeField / DateTimeField — never
                             <input type="date|time|datetime-local">; tests
                             pick through them with test/pickers.ts
  components/FileButton.tsx  choosing a file (the input itself stays hidden)
                             Checkboxes, radios and number boxes are drawn
                             by index.css — keep them real <input>s, no
                             accent-* or custom spinners needed
  components/AppShell.tsx    header, dock, routes' wash colour, alert banner
  lib/queries.ts             shared Supabase reads
  lib/permissionMatrix.ts    the Access & Privileges table: rows with a `key`
                             are the church's grid, the rest hand-maintained
  lib/permissions.ts         the grid's catalog (mirrors `permission_catalog`)
                             and decide(), which mirrors SQL's may()
  lib/usePermissions.ts      can(cap, { departmentId, coordinating, ownerId })
  lib/availabilityHistory.ts the log behind each availability answer (0145):
                             written by a trigger only, read per `avail.history`
  lib/pageAccess.ts          who may open each page (PAGE_RULES), mirrored in SQL
  lib/pageOpening.ts         whether a page opens to somebody, and why: the
                             menu's answer (usePageAccess) and By person's
  lib/personAccess.ts        one person's answers, with the profile behind
                             each — Access & Privileges › By person. It asks
                             grantedBy() and pageOpening(), never its own copy
  lib/tour.ts                the tour: chapters by standing, as data; what is due
  lib/onboarding.ts          what the account remembers of it (0153): seen, sent
  components/Tour.tsx        the engine: walks the pages, points at `data-tour`
                             anchors, Next / Back / Skip; starts itself when due
  lib/display.ts             the screens' preferences, each falling back on its own
  lib/notificationLink.ts    every notification type: its label and its link
  lib/pwa.ts                 install, offline, and the update banner
  auth/AuthContext.tsx       useAuth(): isAdmin, isSuperAdmin, ownerId,
                             isDepartmentHead(), ledDepartmentIds,
                             viewAs / setViewAs (an Admin's preview)
  test/select.ts             helper for driving the custom Select in tests
  public/sw.js               service worker (hand-written, not generated)
supabase/migrations/         numbered, immutable once shipped
supabase/functions/          edge functions (push-notify, invite, clock-in-address)
build/swBuildId.ts           stamps the commit into sw.js at build time
DESIGN.md                    the design system's rules — read before UI work
docs/configuration.md        every setting: what it is, where it lives, what enforces it
```

Routes live in `src/App.tsx`. Settings is a parent route: `/settings` is
the hall (every room, grouped), and each room is its own child route —
`profile`, `appearance`, `pages`, `timings`, `retention`, `display`, `rota`,
`giving`, `menu`, `access`, `alerts`, `logo`, `data`. The rooms, their groups, glyphs and who may open
them are one list, `lib/settingsSections.ts`; the hall, the sidebar and
the redirect for a room you have no key to all read it. The old
`/settings/church` (and its `#rota`, `#giving`, `#menu` anchors) redirects
to the room each became.

Environment: copy `frontend/.env.example`. Without `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` the app cannot boot. Standing a whole instance up
from nothing — including making an account both Admin and Owner, which
are separate and neither is automatic — is [SETUP.md](./SETUP.md).

---

## 5. Frontend rules

- **Compose the primitives; choose nothing yourself.** `Tile`, `Panel`,
  `Row`, `Pill`, `ActionButton`, `Field`, `Overlay`, `PageHeader` from
  `Surface.tsx`. If you are typing a hex code, a `border`, or a shadow, the
  answer already has a name in `DESIGN.md`. Something missing? **Add it to
  `Surface.tsx`**, do not inline it.
- **Never use a native `<select>`.** It draws the operating system's menu,
  which the app cannot style — on a dark card it arrives as a white Windows
  list. Use `Select.tsx`.
- **Every button is a pill, and one primary per screen.**
- Server state is TanStack Query. Invalidate by key after a mutation.
- Tests sit beside what they test and are named for the behaviour a person
  would notice. Reach for `getByRole`.

## 6. Database rules

Permissions are Postgres Row Level Security policies. There is no
authorization layer in the app and there must not be one — the AI assistant
runs tool calls through the calling user's own client, so RLS is the only
thing holding.

Since 0133 the church sets some of them itself, in Settings › Access &
privileges. That does not move authorization into the app: the grid is
rows in `role_permissions`, the policies ask `may()`, and `may()` reads
the rows. The app's `can()` only decides which buttons to draw. The Owner
always passes `may()`, and Admin can always edit the grid
(`app.permissions` is fixed) — that is how a wrong setting gets put right.
Every area is converted (0133–0144), with the defaults reproducing the
old rules exactly — each was dry-run against the live data, old rule
against `may()`, for every person and row, before it went live. Fixed on
purpose, and outside the grid: what anybody can *see* (that follows team
membership and the Pages tab), your own things (your profile, your
answers, withdrawing your own request), the guards that are about time
rather than people (`service_has_finished`, the checklist and debrief
windows), Feedback (the Owner's), and The app itself — who is an Admin or
a Head, settings, the grid itself — because whoever could change those
could hand themselves everything else.

- Add `supabase/migrations/00NN_a_sentence_about_it.sql`. **Never edit a
  migration that has shipped.**
- **Resolve audiences and permissions in SQL.** A client that posts its own
  list of recipients can reach anybody by editing an array. Send the
  intent; let a `security definer` function decide who that means and
  whether the caller may do it at all. `send_announcement` is the model.
- A table only ever written through an RPC gets **no insert policy**. That
  is what makes the RPC the only way in.
- **A write policy names its commands** — `for insert`, `for update`,
  `for delete` — never `for all`. A `for all` policy is also a read
  policy: Postgres ORs it into every select, runs its `may()` on every
  row, and made reading `service_sessions` 300 times slower than its
  "signed in" read rule (0200). `policyCommands.test.ts` holds new
  migrations to it.
- **A new foreign key gets an index** in the same migration, unless it is
  a "who did it" column (`created_by`, `updated_by`, `decided_by` …) that
  nothing filters on. Postgres indexes the parent's key, not the child's
  column, so without one every lookup by it and every cascade from the
  parent scans the table (0204).
- Writing to `notifications` **pushes to that person's phone** — every
  type, since 0185 the board's `message` and the team chat's `team_chat`
  too (one unread line per board and per team's room: each post replaces
  it, so each post pushes and the bell does not pile up). A person can turn
  those two off for themselves (`push_preferences`, Settings › Appearance),
  which push-notify reads; the bell keeps them. A new notification type is
  a new thing that buzzes pockets — decide it on purpose.

---

## 7. Deploying is not merging

Merging ships **the frontend only**. Both of these are separate, manual,
and produce a working-looking app that fails at the moment of use if
skipped:

1. **Apply the migration** to Supabase. A merged-but-unapplied migration
   shows *"Could not find the function … in the schema cache"* to the user.
   Then run `notify pgrst, 'reload schema';` so the change is visible at
   once instead of whenever the cache turns over.
2. **Deploy changed edge functions**: `supabase functions deploy push-notify`.
   `invite` asks `may_invite()` (0144), so deploy it only once 0144 is
   applied — the other way round, every invitation fails.
3. **Some migrations wait for the release.** A migration that takes
   something away the live app still uses must be applied *after* that
   release is live, not before. 0127 (closing email and phone on
   `profiles`) is one: applied early, the app in production loses every
   signed-in person's own profile. Its header says so.

## 8. Things that fail silently

- **Dropping or re-signing a function a SQL function calls.** Postgres
  checks a `language sql` body when it is created and never again, so the
  drop succeeds and every read through the caller fails later. 0177
  dropped the five-argument `poll_is_for_me` while `may_see_poll_voters`
  still called it, and the Polls page failed for everybody until 0180.
  CI now re-creates every SQL function after the migrations
  (`supabase/checks/sql_functions_still_match_the_schema.sql`); before
  applying such a migration to production, grep the migrations and
  `pg_get_functiondef` for every caller.

Each of these has already cost real time. None of them show up in review.

- **Printed QR labels are links that cannot be reprinted on their own.**
  Every inventory label says `https://rim-church-app.vercel.app/inventory/scan/<item id>`
  (`lib/qrLink.ts`). Changing `SCAN_PATH`, dropping its route in
  `App.tsx`, or retiring the vercel.app address turns every label already
  stuck on a case into a dead link, and nothing fails until somebody scans
  one. `qrLink.test.ts` pins the path and the route. A page that has to
  move keeps this route and sends it on; a new domain is added beside the
  vercel.app one, never instead of it. The label carries the item's id
  only, so renaming an item or changing its serial number is safe.
- **A new table is not live until two lists say so.** Every screen refetches
  the moment a table changes (`lib/useLiveData.ts`): a statement trigger on
  the table broadcasts `{"table": …}` on the private topic `live` (0202),
  and the app refetches only the query keys named for that table in
  `lib/liveTables.ts`. A table with neither still loads and still saves; it
  just goes stale on everybody else's screen until they come back to the
  tab. 0166 and 0167 shipped that way, and 0168 is the migration that
  caught up. A new table needs its `<table>_live` trigger calling
  `public.live_table_changed()`, as in 0202, and a `LIVE_TABLES` row;
  `liveTriggers.test.ts` checks the two agree and `useLiveData.test.tsx`
  that the keys exist. Not the `supabase_realtime` publication: Postgres
  Changes made Realtime read the change log and ask every watcher's read
  policy about every changed row, which was most of what the database did
  (0202). The bell alone hears rows, on `notifications:<user id>`.
- **A service is deleted 14 days after its date, and takes everything
  hanging off it** (0128, `service_retention_days`) — rota, availability,
  running order, ticks, set lists, debriefs, issues. A new table with a
  `service_id` foreign key on cascade joins that clock; one that must
  outlive its service must not cascade. Activity triggers on those tables
  already skip a service that is being deleted (`record_activity`) — keep
  it that way, or the clean-up floods the feed.
- **Church Updates and polls carry their own end** (`ends_at`, `clears_at`,
  0128) and their select policies hide them the moment it passes. Anything
  that reads them with the service role has to filter for itself.
- **`profiles` is readable column by column** (0127). Email, phone and
  marital status are closed to everybody; the Owner reads others' through
  `people_contacts()`, everyone reads their own through `my_profile()`,
  and a Head adds by address through `person_by_email()` (0126). A
  `select('*')` on `profiles`, or any column not in 0127's grant, fails the
  **whole query** — and a new column starts closed until a migration
  grants it. `lib/profileColumns.test.ts` reads every select in `src/`
  against the grant; keep it passing rather than loosening it.
- **Every new function is callable by anyone signed in.** Since 0206 a
  new function is closed to anon (and to PUBLIC) by default, and only
  `reject_removed_user` — the pre-request hook, which runs on signed-out
  requests too — is open to them; one a signed-out request must call needs
  its own `grant execute … to anon`. Supabase still grants authenticated,
  so a `security definer` helper meant only for a trigger or a cron job is
  also an RPC that runs with the owner's rights. Either check `auth.uid()` /
  `may()` inside it, or `revoke all on function … from public, anon,
  authenticated` in the same migration. 0151 closed five that did neither
  (`join_invited_team`, `clear_message_board_if_due`, `record_activity`, …)
  and 0169 finished the list after the security audit: every read helper
  is closed to anon, and the ones only definer code calls
  (`person_name`, `awaiting_availability`, …) to authenticated as well. A
  helper a policy evaluates must stay executable by authenticated — a
  policy runs as the caller — so bind it to `auth.uid()` inside rather
  than revoking it. What that grant leaves open (any signed-in account
  asking `POST /rpc/is_dept_member` about anybody) is closed at the door
  instead: the PostgREST pre-request hook `reject_removed_user` (0070)
  refuses a request whose `request.path` names one of the database's own
  helpers (0175, the `helpers` list in its body). A new policy helper
  belongs on that list; a new RPC the app calls must not be on it.
- **The tour points at `data-tour` anchors.** `PageHeader` is every page's
  `page-title`; the rest are named where they are drawn (`dock`, `search`,
  `bell`, `account`, `serving-tabs`, `join-team`, `rota-assign`,
  `ready-light`, `board-composer`, `people-invite`, `people-export`, and
  `settings:<room>` on the Settings hall's tiles). A step whose anchor
  never turns up falls back to the page's header, then to a card in the
  middle — so a renamed anchor is a quieter tour, not a broken one, which
  is why `lib/tour.test.ts` checks every anchor is still written somewhere.
- **A guard on DELETE is not a guard on UPDATE.** A FOR ALL policy lets
  the same change through as an edit. `user_roles` has both triggers now
  (0033 delete, 0151 update); a new "only X may remove Y" rule needs both.

- **`public/sw.js` must keep `const BUILD_ID = '__RIM_BUILD_ID__'`.** A
  browser installs a new service worker only when `sw.js` differs byte for
  byte; without the placeholder it is identical every deploy and the "a new
  version is ready" banner can never appear. It shipped that way for 84
  deploys. The build now fails loudly if the line goes — leave that guard.
- **A release is announced once per account** (`lib/releases.ts`, `WhatsNew`,
  `onboarding.releases_seen`, 0156). A new page or a changed habit gets an
  entry there — key never reused — or people find it by accident.
- **Two copies of the notification map** must agree:
  `lib/notificationLink.ts` and `functions/push-notify/index.ts`. One is
  browser, one is Deno. They have drifted once already.
- **Tailwind only sees class names written literally in the source.** A
  name built at runtime — `` `${prefix}:opacity-100` `` — produces no CSS at
  all. Write each variant out in full. Inside an arbitrary variant a space
  is spelled `_`: `[@media(hover:hover)_and_(pointer:fine)]:opacity-0`.
  Verify against `dist/` when unsure.
- **jsdom has no `scrollIntoView`.** Guard calls to it.

## 9. Recipes

**A new page**: route in `App.tsx` (inside `PageGate` unless everybody may
always open it) → a rule in `lib/pageAccess.ts` `PAGE_RULES` (default,
choices, what enforces it — and the same choices in SQL's
`page_access_is_valid`, in a migration, if it has a key) → nav entry in `lib/navItems.ts` `NAV_ITEMS`,
with the default `group` it sits under in the More sheet (Sunday, After the service,
Talk, Church life, People & things), placed beside the rest of its group. An Admin can rearrange the menu in App
settings (`nav_layout`, 0121, `lib/navLayout`); a page that arrangement has
never seen lands in its default group, or at the top. It can also rename a page
(`nav_layout.labels`, path to name): the menu and dock, the search box and the page's
`PageHeader` say the new name — the heading at the page's own address only, never on
the dashboard (a greeting) or a page further in →
a step in `lib/tour.ts` for whoever should be shown it (the test holds
every step to a page and an anchor that exist) →
a wash colour in its `WASH` map → `PageHeader` with an eyebrow, like
every other page.

**A new kind of dashboard reminder** (something somebody must do, kept in
sight until done): a branch in `my_open_requests()` (0178, a new
migration replacing it) returning the same columns, and an entry in
`REMINDER_KINDS` in `lib/reminders.ts` — what it is called, where it
links, what the button says. `ReminderBanner` itself knows no kinds; a
kind the app does not list is left out rather than shown wrong.

**A new notification type**: add it to `NOTIFICATION_TYPES` *and* the map in
`notificationLink.ts` (the type is exhaustive, so a miss is a compile
error), add the same entry to `push-notify/index.ts`, then emit it from a
migration. Remember it will push.

**A new permission** is a cell in the church's grid (0133), not a role
named in a policy. In one migration: add its five catalog lines to
`permission_catalog` — one per profile, `reaches` narrowest first, the
default reproducing today's rule exactly — and have the policy ask
`public.may(auth.uid(), 'area.action', department_id, service_id, owner)`.
Keep every guard that is not about who (`service_has_finished`, a window
closing) outside `may()`. Then the same entry in `lib/permissions.ts`
`CATALOG`, a `key` on its row in `lib/permissionMatrix.ts`, and buttons
that ask `can()`. `permissionCatalog.test.ts` reads every migration and
fails if the two catalogs differ, or if a policy asks `may()` about a
capability nobody catalogued. Dry-run the old rule against `may()` for
every person, team and service before applying — 0133–0144's did, and
found none that differed.

A rule that is fixed on purpose (see above) is still a plain policy: write
it in a migration and add its row (without a key) to
`lib/permissionMatrix.ts`; an area with no key at all says why in `fixed`.
That page claims to describe the database; a capability missing from it
is the page starting to lie.

**A new app-wide setting**: first decide which kind it is
(`docs/configuration.md`). **A rule** the database must obey —
`app_settings` column with a check constraint in a migration →
`lib/appSettings.ts`. **A preference only the screens read** — a key in
`lib/display.ts` (`DISPLAY_DEFAULTS` and `readDisplay`, which falls back
per key), no migration → read it with `useDisplay()`. Either way, **one
entry in `lib/settingsCatalog.ts`**: its name, one line, the long
explanation (behind "How this works"), the pages it moves (`affects`:
routes, or `BELL`/`ALERTS`/`APP`/`SERVICE_PAGES_REF`), and how to read and
write it. Then add its id to the room it belongs to — Timings
(`AppSettingsCard`) for when things open and close, Data & Retention
(`RetentionCard`) for what is deleted and when, Dashboard & Lists
(`DisplayCard`) for what is drawn — and Page by Page shows it under its
pages by itself. `settingsCatalog.test.ts` fails if a column or a display
key is missing from the catalog, or a page it names does not exist. Rooms
save through `useSettingsDraft(keys)`, which sends only the columns that
moved, so no room can undo another. A new clock needs its sentence in
`lib/lifespan.ts`. A control that is more than a row (the rota's tags, the
Giving links) keeps its own room, linked from its page in `PAGE_ROOMS`
(`lib/pageSettings.ts`).

**A new permission** also says which page it is about: its area's `pages`
in `lib/permissionMatrix.ts`, or its own `at` when the area spans several,
and a `short` name for the team-by-team grids. `settingsCatalog.test.ts`
checks every row lands on a page.

**Who can open which pages** is Access & Privileges › Pages
(`PageAccessCard`), and each page's own row in Page by Page.

**A new way in** to a page or an action — a list in some room that names
people or teams, an Overwatch switch — is also said in
`lib/personAccess.ts` (`namedFor()`, or `explainCapability()`'s Overwatch
map), or By person will tell an Admin somebody can't do what they can.

**A new Settings room**: an entry in `SETTINGS_GROUPS`
(`lib/settingsSections.ts`) with its glyph, tone and `needs`, a child
route in `App.tsx`, and a pane export in `pages/SettingsPage.tsx`. The
shell draws its title and blurb, so the room itself starts with content,
not a heading.

---

## 10. How to report what you did

There is **no `.env` here and the app cannot boot**, so a change cannot be
checked by eye. Say that plainly rather than implying you watched it work.
What you actually have is types, tests, the build, the compiled CSS in
`dist/`, and — through the Supabase tools — the live schema. Prefer
checking a claim against real output over reasoning about it, and state
what remains unverified.

Commits and PR descriptions explain **why**, in prose, at the length the
change deserves. Read the recent history for the tone.

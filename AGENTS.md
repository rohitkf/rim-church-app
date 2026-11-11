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
- Opening the PR is pre-approved. So is **applying a migration to
  production**: the Owner has given standing permission (November 2026),
  on the condition that it has passed the local CI database (§7) and a
  dry run on production first. **Deploying an edge function and sending
  anything to real people still each need the Owner's explicit yes, every
  time.** A yes for one deploy is not a yes for the next; "once you're
  done" or approval of a plan is not a yes to deploy. Setting function
  secrets needs a yes too.
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
npx vitest run                           # ~2700 tests, all must pass
npm run build                            # catches what tsc alone misses
```

CI (`.github/workflows/ci.yml`) runs the same checks, split for speed:
`frontend` (lint + build), `frontend tests (1/4)`…`(4/4)` (vitest
`--shard`), `migrations`, and `backend` / `docker` only when their own
files (or CI itself) change — `changes` works that out, and a skipped job
counts as green for auto-merge. Keep the job names: auto-merge and any
required check read them. A newer push cancels the older run of the same
event and ref.

`npm run lint` (oxlint) exits 0 with **46** standing warnings (count them:
`npm run lint 2>&1 | grep -c ': warning '`). Do not add to them; do not fix
unrelated ones in a PR about something else. The two that new code trips
most: exporting a helper from a component file (`only-export-components` —
put it in `lib/`), and `Date.now()` during render (`purity` — use a clock
hook such as `useNow` in `lib/timeLeft.ts`).

Run these one after another in a single shell, with absolute paths. Two
shell calls at once share one working directory and trample each other:
a gate run beside another command once reported 1,212 failing tests and
"tsconfig.app.json does not exist" for a clean tree.

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
| `permission_roles`, `permission_catalog`, `role_permissions`, `department_permissions` | who may do what: six profiles (Admin, Team Head, Assisting Head — its own column since 0162 — Team Coordinator, Team Member, Church Member), and since 0214 two church-wide standings with a few cells of their own — Overwatch (its five, below) and Pastor (the three prayer rows, fixed at Everywhere; since 0268 a cell on every other row too, No or Everywhere, No out of the box bar the three registrations cells of 0267 — all but `PASTOR_LOCKED` in `lib/permissions.ts`; `may()` reads it as a tier like an Admin's). Since 0269 every cell that can honestly be the church's is: what was a fixed No (a Church Member's and a Team Coordinator's on most rows) is a choice of No or Everywhere, No out of the box, and a No-or-team choice offers Everywhere too. Since 0270 Overwatch has a cell on every row as well, read by `may()` as a Pastor's is — never its five own cells (`OVERWATCH_OWN`), which stay `overwatch_may()`'s. What stays fixed, because a cell there would lie or hand over the keys: `app.permissions`, the two `*.as_overwatch` rows, `page.*` on the pages a Team Member always opens (Team Rota, Polls, Teams, Prayer Requests — elsewhere, since 0274, a page can be kept to the Admins or to the Owner: its Admin, Team Head and Assisting Head cells are a choice starting at Yes, `can_open_page()` asks `may()` without passing an Admin first, and the app opens a page in the grid by `decide()`, not by standing), (until 0275, an Admin's Yes on Clock In and Stage Layout — now a choice starting at Yes: `may_see_clock_ins()`, `may_approve_clock_ins()` and `stage_may()` ask `may()` alone, and the Clock In page opens by `clockin.view`, never by standing; what is not a row in the grid stays an Admin's by standing — where church is, correcting a clock-in, approving a block move), a Pastor's three prayer rows, and for Overwatch what it already reads through its room (`overwatchLocked`) — what each can be given, the church's own choices, and one team's own choices (0162: no wider than the team; `may(uid, cap, dept)` reads the team's cell for `dept` first). Settings › Page by Page (a page at a time, team by team), or Access & Privileges (by role, by person, by team, or by page-opening rule) |
| `permission_grants` (0208) | one thing more: a capability for a person by name, or for everybody on a team (roster, Head, Assisting Heads), on their teams or everywhere. `may()` asks it last, so it only adds; only what the grid could give a non-Admin profile, never the keys to the app (`permission_grant_is_valid`). May end on a date (`expires_at`, 0218): `may()` passes an ended one by, the app filters it out on read, and `delete_expired_permission_grants()` removes its row nightly. Written by `set_permission_grants()` (`until` on a change sets or clears the date; a change that leaves it out keeps a live date); Access & Privileges › By person, By team |
| `department_guests` | the guest roll's people on a team, `core` or `guest`, until they sign up: linking a guest to an account (`guests.became_member`) moves their rows into `department_members` (0161). Their availability answers are given for them and kept apart in `guest_availability` (+ `guest_availability_history`, 0166), and their rota roles in `guest_rota_assignments` (0167: one role per service, never Team Coordinator, no checklist or tags; the rota page reads both, keyed `guest:<id>` — lib/guestRota). Both move onto the account at sign-up; reminders, readiness, polls, checklists and late-answer asks read `rota_assignments`/`availability` and so count account holders only |
| `settings.*`, `app.permissions`, `people.roles` / `people.admins` / `people.unadmin`, `feedback.send` / `feedback.manage`, `people.contacts` / `people.compliance`, `page.availability` / `page.checklists` / `page.team_chat` / `page.songs` / `page.volunteers` (0277) | **nothing in Settings is fixed** (the Owner's instruction, November 2026). Every room of Settings is a row in the grid — `settings.general`, `.menu`, `.pages`, `.rota`, `.stage`, `.clockin`, `.prayer`, `.overwatch` (Admins out of the box) and `.logo`, `.video`, `.feedback`, `.erase` (nobody but the Owner out of the box) — so a room opens to a role's cell, or to a team or a person given it by name (`lib/settingsSections.ts`: `capability`, and `also` for rooms that hold the grid's rules too). The settings row is guarded column by column: `app_setting_rooms(col)` names the rooms a column belongs to, the `app_settings_guard_rooms` trigger refuses a changed column whose room the caller does not hold, and a column not named there is Page by Page's. The grid itself (`app.permissions`) is a choice in every cell — every Admin out of the box; the Owner always passes `may()`, so nothing here can lock the Owner out. Roles: `people.roles` gives and takes Head, Assisting Head, Overwatch, Pastor and Service Flow Coordinator rows of `user_roles`, `people.admins` makes an Admin, `people.unadmin` takes Admin from somebody else (anybody may still give up their own; the Owner's cannot be taken). Feedback: `feedback.send` (anybody on a team out of the box; it opens /feedback) and `feedback.manage` (reads and answers everybody's; told of new feedback). `people.contacts` (everybody's email, phone, households: `people_contacts()`) and `people.compliance` (everybody's `profile_sensitive`) were the Owner's alone. **A room gives out its own rights**: `permission_room(cap)` maps `clockin.*`, `prayer.*`, `stage.*` and `planner.*` to their room, and `set_permission_grants()` lets the room's holder give those (and only those) without the grid; `set_permissions()` lets the Overwatch room's holder set Overwatch's five own cells. Rooms draw each section for whoever may change it (`mine` / `givesRights` in the cards). Every page but the Dashboard has a level since 0277 — the four a Team Member always opened (Team Rota, Polls, Teams, Prayer Requests) can be kept to Heads, Admins or the Owner, and Availability, Checklists, Team Chat, Songs and Volunteers have rows of their own; Clock In, the Countdown, Registrations, Reception and Feedback open by their own rows (`enforcement: 'permission'`, `by`), Issues follows who may raise one (`'follows'`). **Still fixed, because a choice would be untrue**: handing over ownership, the Owner's own Admin role, the Dashboard (where everybody lands), a Team Coordinator's and — on pages that need a team — a Church Member's cell on a page's row, the two things done as Overwatch, and your own things. `admin_reset_data()` never deletes the Owner's account, whoever runs it |
| `permission_changes` (0216) | who changed which rule: a row for every insert, change or delete in `role_permissions`, `department_permissions` and `permission_grants`, written by the `log_permission_change()` trigger with `auth.uid()` (none when the app itself did it, in a migration); team and person kept as bare ids so a row outlives them; a grant's end date before and after (0218). Read by whoever may change the grid; Access & Privileges › History |
| `user_roles.role_type` | `admin`, `department_head`, `assisting_head`, `service_flow_coordinator`, `overwatch`, `pastor` |
| `role_type = 'overwatch'` (0186, 0187) | **Overwatch** — sees every team as an Admin does (`can_view_department_content` / `may_read_team` say yes, and the reads that ask other things have an `*_overwatch_read` policy beside theirs), changes almost nothing: `may()` gives it nothing. It may do five things, each its cell in the grid's Overwatch column (0214: `msg.board_post`, `msg.chat`, `msg.polls`, and its own `issue.as_overwatch` and `debrief.as_overwatch`, which nobody else may be given) read by `overwatch_may()` — never by `may()`, because each is done as Overwatch, church-wide on the board, as themselves, on a page open to it. Until 0214 they were `app_settings.overwatch_*` switches, dropped in 0217. It opens the pages `app_settings.overwatch_pages` leaves open (page → open; Volunteers starts closed) through `can_open_page` / `overwatch_sees()`. Its issues carry `raised_as_overwatch`; its debrief is the one with `department_id` null (one per service, `unique nulls not distinct`). Given from Volunteers (Admins), set in Settings › Overwatch (its pages, and the same five cells) or its column in Access & Privileges. On screen `seesAllTeams` (Admin or Overwatch) is for what is drawn only — never for what may be changed. Contacts, compliance and households stay the Owner's |
| `services` → `service_sessions` | a service and its running order |
| `planner.*` (0184, 0211) | the planner's **buttons given to a team or a person** — capabilities `planner.start` `planner.hold` `planner.add_time` `planner.skip` `planner.substitute` `planner.add_below` `planner.remove` `planner.end`, held through the grid or a grant (0208); until 0211 they were `app_settings.planner_controls`, dropped in 0217. Whoever has `svc.sessions` (or `svc.manage`, for End service) has them all; these only add. Edited in Settings › Page by Page › Service Planner (`PlannerControlsCard`, saved as grants); read by `planner_control(variadic text[])` — `may()` for each — in the policies, and by `usePlannerControls` to draw the menu. A guard trigger on `service_sessions` and on `services` refuses any column outside what the holder's buttons write (a holder of Add time cannot rename a session) |
| `service_session_assignees` | who is taking a session — a list, one row per person. `is_substitute` (0182) marks whoever steps in if they cannot: a second list on the same rows, from the session's ⋯ › Assign substitute, drawn apart (amber, dashed, Sub) on the planner, its Preview and the exported sheet. `peopleOn` is the people taking it only; `substitutesOn` the rest. A person is on a session once, in one list |
| `announcements` | the alert an Admin sends from Settings |
| `app_notices` (0278) | a **notice**: a line at the top of every page for as long as it is true. Not an alert: nobody is interrupted, no phone buzzes, nothing is pressed. Three kinds (`info`, which a person may put away on their device, `warning`, `maintenance`), shown between `starts_at` and `ends_at`. A maintenance notice may also **close the app** between `closed_from` and `closed_until` (`closes_app`): those are not the showing times, because the notice warns before it closes. Written in Settings › App Notices by whoever holds `settings.notices` (the Owner alone out of the box); `app.open_when_closed` (Admins out of the box) is who keeps working while it is closed. `lib/appNotices.ts`, `AppNoticeBanner` in the shell, `AppNoticesCard` |
| `team_messages` (`kind='alert'`) | a team alert |
| signed in, on no team (`is_on_a_team` false) | a **Church Member** |
| `rota_tags`, `rota_assignment_tags` | the rota's tags — Shadow and the church's own |
| `giving_page`, `giving_links`, `giving_bank_accounts` | the **Giving** page (Tithes & offerings) |
| `team_polls` (`audience`: everyone · team · people · service; `anonymous`, 0172) | the **Polls** page — any audience, not only a team. On an anonymous poll the vote rows reach only their own voter and the Owner (plus Admins, or Admins and the team's Heads, by `app_settings.poll_voters_seen_by`); everybody reads the counts through `poll_tallies()`. Changed or deleted only by its asker, an Admin (the Owner included, 0177), or — for a poll with a `department_id`, while `app_settings.poll_managed_by` is `leads` (the default) — that team's Head or Assisting Head, who also always see it (0179, 0181). `poll_top_count` / `poll_top_seen_by` (0181) lift and mark a poll's most-picked options on screen only (`topOptions` in `lib/polls.ts`); the counts are everybody's anyway. `include_guests` / `guest_ids` (0177): a guest is somebody in the audience only through a guest place on a team (`poll_person_is_guest`); false leaves them all out, a list asks only those, null asks every guest. Who sees it and who is told are both `poll_admits` inside `poll_is_for_me` and `poll_recipients` |
| `my_open_requests()` (0178) | the dashboard's **reminders** — what is waiting on the caller (an unanswered poll, availability not given, an unread mention), worked out from the things themselves so it goes when answered. An availability ask for a later day waits while any of today's services has not ended (`service_ended_at`, 0183). Shown by `components/ReminderBanner` |
| `church_updates` | the **Church Updates** page |
| `profile_gaps()`, `my_profile_gaps()`, `people_setup()`, `prompt_setup()`, `close_setup_prompt()`, `onboarding.setup_asked_at` / `setup_closed_at` (0276) | **who has filled in who they are, and Getting set up.** The joining form (0097) is the door for everybody, not only a new account: `profile_gaps(uid)` names the form's questions with no answer on a profile, in `lib/joining.ts`'s field names (the SQL copy of `missingAnswers`; `gettingSetUp.test.ts` holds its settled statuses and names to the form's), `AuthContext` loads the caller's as `profileGaps`, and `ProtectedRoute` shows `<JoiningPage completing />` — what they gave filled in, the blanks marked — while the list has anything in it. Null (not answered yet, or could not be asked) lets them in: nobody is shut out on a guess. A DBS answer cannot be told from the column's default, so it is never a gap; a visa date on record answers "does it have an expiry?". Settings › Onboarding is one table, `people_setup()` for everybody the caller may send the tour to (`may_onboard`): a read-only tick per thing — profile complete, phone, birthday, marital status, UK status (ticks from the gap names, never the answers), tour (`tourStatusOf`), location and app installed (`location_access`), notifications (a live `push_subscriptions` row) — in `lib/gettingSetUp.ts`. `prompt_setup(users)` (null: everybody with something left; only those are asked either way) stamps `setup_asked_at` and sends a `setup_prompt` notification; `components/SetupPrompt` then shows a closable card of what is left *on that phone* until `close_setup_prompt()` ("Not now", or nothing left) — a reminder, never a door |
| `app_feedback` (`kind`, `status`) | the **Feedback** page — about the app, not a Sunday; sent via `submit_feedback`, read and answered by the Owner alone via `mark_feedback` (0124, 0125) |
| `stage_areas` → `stage_layouts` → `stage_blocks`, `stage_comments`, `stage_layout_log` | the **Stage Layout** page — one workspace per service, the areas (Stage, Audience, …) as regions of it, a block in one region (a block can be a row of seats, or an item drawn as a line picture — `kind = 'item'`, `icon` a key from `lib/stageIcons.ts`, 0160 — and its corners are sharp unless set rounded; an Admin can lock one, and then nobody — the Admin included — moves, edits or deletes it until it is unlocked; others ask to move it through `stage_move_requests`, and a template or a clear over a locked block is refused, 0157 and 0159); who may draw is the grid's `stage.add` · `stage.edit` · `stage.delete` · `stage.comment` · `stage.templates` rows, a team given them as grants from Settings › Stage Layout (`stage_may()` asks `may()`, 0212; `stage_team_access`, 0155, dropped in 0217); the log is trigger-written; `stage_templates` kept, `stage_template_requests` for an Admin to answer |
| `service_issues` | the **Issues** page — raised via `raise_issue` inside `issue_window` (Heads and Admins exempt, 0119), a Head's verdict (`outcome`, `remarks`) via `mark_issue` (0117–0119) |
| `registration_events` → `registration_event_dates`, `registration_ticket_types`, `registration_promo_codes`; `registration_orders` → `registration_order_tickets` (0244) | the **Registrations** page — events anybody signs up for from a link, no account needed. The public page `/register/<slug>` and the ticket `/ticket/<code>` (its QR code says that link) read and write through security-definer functions granted to `anon` — `registration_public_event`, `registration_promo_check`, `registration_register`, `registration_order_view`, `registration_order_payment`, `registration_order_cancel` — and `registration_orders` has no insert policy, so `registration_register` (a lock per ticket type, capacity per type or per date, a trap field, five orders per email) is the only way in. Who runs it is the Owner and whoever the grid gives `reg.manage` ("Run registrations"), never a level: `pageOpening` answers `/registrations` before the level check, so an Admin needs the cell. An order holds its tickets from the moment it is made; a paid one goes `awaiting` → `reported` (the attendee says they paid, by a link or a bank transfer with the code as reference) → `received` (marked by the church), or `waived`; no money passes through the app. A published event with `add_to_diary` has one `church_events` row per date, with a Register link, kept by `registration_sync_diary`. Running it (0245): `registration_order_mark(id, action)` — received, waived, awaiting, check_in, undo_check_in, cancel, restore (a restored order is checked against what is left) — for whoever may `reg.manage`; a ticket type selling out puts a `registration_sold_out` notification to everybody `registration_managers()` names (the Owner and the grid's `reg.manage`), which push-notify sends on; `app_settings.registration_retention_days` (90; null never) and the nightly `registration_anonymise()` blank name, email, phone, attendee names and notes on every order of an event that many days after its last date, and stamp `anonymised_at` — the order, its code and its sums stay until the event is deleted (Settings › Retention; export to Excel from the event's page first). The door (0246): Scan tickets on the event's page opens `components/TicketScanner` — the camera through `lib/qrCamera` (shared with the inventory's `QrScanner`), `codeFromScan` on what it reads, the order from the page's own list, Check in or Paid now + check in through `registration_order_mark` — or the code typed. The ticket by email (0247): `supabase/functions/registration-email` — `{kind:'confirm', code}` after registering and from the ticket page's "Email me this ticket", `{kind:'resend', slug, email}` from the public page's "Get your ticket again"; only ever to the address an order holds, ten minutes apart at most (`email_sent_at`), the same quiet answer whether or not an address has a registration; through Resend from `REGISTRATION_FROM` with `RESEND_API_KEY`, links on `SITE_URL`. Reception (0247): the **Reception** page `/door` opens to the Owner, to `reg.manage` and to the narrower `reg.door` ("Work the door" in the grid; `registration_may_work(uid)` is either, and the five tables' read policies use it) — today's event comes up on its own (`doorEvents`/`todaysEvent` in `lib/registrations.ts`), then Scan (`components/TicketScanner`'s `ScannerPanel`, the same one the event's page wraps in a sheet), Find (anybody by name: check in, undo, Paid now) and Walk-in (`registration_walk_in(event, order)`: an order made at the door, `source = 'walk_in'`, `email` nullable now, paid or still owing, checked in, the same capacity lock as online). `registration_order_mark` lets `reg.door` do `check_in`, `undo_check_in` and `received` only, and stamps `received_at`/`received_by` on received and waived. Proof of an online payment: the ticket page is a *registration* until a paid order is paid (same code, same QR — reception scans it to take the money) and a *ticket* after; "Yes, I've paid" / "I've sent the transfer" asks for the receipt — a screenshot or PDF into the private `registration-proofs` bucket under the order's own code (anon may insert only where `registration_proof_allowed(name)`: a live, still-owing order on a published event; only `registration_may_work` reads it back) — or the payment reference, or both; `registration_order_payment(code, method, done, proof_path, reference)` refuses a done online payment with neither and marks it `reported` ("Receipt sent — being checked"). On the event's page the receipt opens from a signed link beside the order, *Mark as received* confirms it and sends `{kind:'paid', code}` ("your ticket is confirmed"), *Not received, ask again* puts it back to awaiting and sends `{kind:'unmatched', code}`; both kinds want a signed-in caller who may work, skip the quiet period, and the confirm email calls an unpaid order a registration. Who took the money and when is on the order and in the export (How, Received at, Received by, Receipt reference). The link tile has the event's QR code, downloadable as a PNG (`lib/qrPng.ts`) for a poster: it says the register link. The picture's focal point (0248): the page shows the picture 16:9, cropped to fit, so `image_focus_x`/`image_focus_y` (0–100, the middle by default) say which point stays in view — picked in the editor with `components/FocalPointPicker` (tap or drag the dot, or the two sliders, with the crop previewed), carried out by `registration_public_event` and `registration_order_view` as `image_focus`, and placed by `imagePosition()` (CSS object-position) on the public page and the ticket; in the editor the picker opens from a *Position the picture* button, so scrolling past never moves it. Online events (0249): `attendance` is `in_person`, `online` or `both`; an online one has `join_url` (https) and `join_details`, which `registration_public_event` never returns — `registration_order_view` hands them to a ticket as `join` only when the order is live and has nothing left to pay. An online event saves no place. A promo code's tickets are an explicit choice in the editor (every paid ticket, or only those ticked — `ticket_type_ids` empty still means every one). Cancelling and refunds (0250): an event is cancelled, not deleted — `registration_event_cancel(event, note)` sets `cancelled_at`/`cancel_note` and status `closed` for good (the `registration_events_guard` trigger refuses reopening), drops its diary rows, and marks every live order whose money is in (`registration_money_in`: received or reported) `refund_status = 'owed'`; cancelling a paid order (church or attendee) does the same. `registration_order_mark(id, 'refunded')` stamps `refund_at`/`refund_by` and deletes the order's `registration_refund_details` row — bank details sent through `registration_refund_request(code, details)` only when the money was paid at reception (`registration_refund_needs_details`); bank transfers and PayPal go back the way they came. `registration_orders_keep_unrefunded` refuses deleting an order whose money is in and not refunded, and only the Owner may delete an event (typed-name confirm in the ⋯ menu). An attendee cannot cancel a checked-in ticket. The `event_cancelled` email kind (signed-in `reg.manage` caller) tells every address on the event, with how each refund will come. Separate rights (0251): each part is its own grid cell — `reg.view` (View & export), `reg.edit` (Make & edit events), `reg.approve` (Approve payments), `reg.refund` (Refunds), `reg.cancel` (Cancel & delete), `reg.door` (Check people in), `reg.door_pay` (Take payments at the door), `reg.walk_in` (Register walk-ins); `reg.manage` stays all of it except deleting an event (the Owner's and `reg.cancel`'s). Every database check goes through `registration_can(uid, what)` (`office`, `door`, `work`, `edit`, `approve`, `take_payment`, `refund`, `cancel`, `delete`, `check_in`, `walk_in`); the pages read the same rule from `lib/registrationRights.ts` (`useRegistrationRights`) and show only what the person may press. The orders table is written directly only by `reg.manage`; notes go through `registration_order_note`. Any office right opens /registrations, any door right opens /door. Refund details as a choice (0253): `registration_refund_request` takes bank details from *any* order with a refund owed — required for cash (`registration_refund_needs_details`, still sent as `refund_details_wanted`), a choice for a bank transfer or PayPal (not back after 5–7 working days, or another account wanted); the office row embeds `refund_details(created_at)` (null without the Refunds right) and says when they came, and the refund sheet opens for every way of paying. The office pages say what wants doing: the list groups events (taking registrations, drafts, closed or past, cancelled — `groupEvents`) and counts receipts to check and refunds owed on each; the event's page has a *What wants doing* row that sets the orders filter (which has a `to_check` segment, each segment counted), and a row whose order needs a decision carries it as a button (`nextSteps`: Mark as received / Not received on a receipt, Mark as refunded / Where to send it on a refund) beside the ⋯ menu. The audit (0254): the link cannot change once published (the editor locks the field; `registration_events_guard` refuses it); no money is taken on a cancelled order (`registration_order_mark` refuses received/waived until it is put back); a check-in is a day's — `checkedInToday()` is what the scanner, Find and the "here" count go by, so on the second day of a two-day event the same ticket is checked in again; `saveRegistrationEvent` refuses, before writing anything, to remove a ticket type or a date that has registrations on it (the deferred foreign keys from 0246 refuse too, but late and in their own words); and `orderTotals` rounds a percentage as the database does. A deleted event leaves the diary (0255): `registration_event_dates_take_diary_row` (after delete) drops a date's `church_events` row with it, so deleting an event or removing a date in the editor leaves no diary entry pointing at a page that is gone. Verifying a payment (0267): `reg.verify` ("Verify payments") is its own right — `reg.manage` does not give it; a Pastor's and the Owner's out of the box, because the Pastor is who sees the bank and PayPal — and `registration_order_verify(order, verified)` stamps or clears `payment_verified_at`/`payment_verified_by`, shown as the *Verified payment* tag on the event's page, at Reception and in the export. It does not mark the order received: the office still does. A payment sent back to awaiting (or waived) loses it (`registration_orders_unverify`). `reg.door_view` ("See Reception, read only") opens /door with the list and counts and nothing to press; a Pastor has it and `reg.view` out of the box, so both pages open to them read-only |

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
  A list has a third part between the two, **"During the service"**
  (`phase = 'during'`, 0260): it opens when the service starts (its
  first session's start; with no times, with the before half) and closes
  with the before half. An assignment carries each part by its own flag —
  `include_pre`, `include_during`, `include_post`, never all off — and
  SQL asks `assignment_carries_part()`, the app `carriesPhase()` /
  `lib/checklistParts.ts`.
- **A checklist item climbs a fixed chain**, and the order never changes:
  `pending` → `member_complete` → `head_verified` → `coordinator_verified`
  (the `checklist_item_status` enum, mirrored 1:1 by the `status-*` colour
  tokens). A new stage means a new token, never a reused accent.
- **An optional checklist line counts only once it is taken on** (0259,
  `department_role_checklist_items.optional`). Untaken (pending) it is
  out of every percentage, of `awaiting_checklist`'s reminders and of
  Check all; from the assignee's tick it is an ordinary item. Anything
  that counts a role's list asks `countsTowardReadiness()`
  (`lib/readiness.ts`) rather than counting rows.
- **Head and Assisting Head are identical in every rule.** Do not write a
  policy that distinguishes them.
- **The Team Coordinator is a rota role, not a rank.** Whoever holds it for
  a service can sign that service's checklists off, and only then.
- **Who opens which page is the church's choice, within limits the
  database can honour** (0123, `docs/configuration.md`). Each page in
  `lib/pageAccess.ts` `PAGE_RULES` has a default and the levels it may be
  set to — `everyone`, `team`, `leads` (Heads), `admins`. Since 0215 a
  page with a choice is a grid row, `page.<key>` (hyphens become
  underscores), and its level is two cells — a Church Member's and a Team
  Member's (`lib/pageCells.ts` turns one into the other; Admins and Heads
  fixed yes, a Coordinator fixed no). `app_settings.page_access`, which
  held the levels until then, is dropped (0217); `usePageLevels()` gives
  every page's level from the grid. A grant of `page.<key>` opens that page to one person or a
  team, whatever its level. Admins always may. Out of the box a Church
  Member sees the church's shape, not its teams' working: Dashboard,
  Service Planner, Events, Set Lists, Giving, Church Updates, Polls (the
  ones addressed to them) and Teams (to ask to join one). Gated routes sit
  behind `PageGate`; the menu, search and gate all ask `usePageAccess()`.
  The tables follow too: their select policies call `can_open_page(uid,
  page)`, which asks `may(uid, 'page.<key>')` for a page with a choice
  (the rota's only widen — Availability and Checklists read the same
  rows). `PAGE_RULES` and the `page.*` cells must agree —
  `pageCells.test.ts` and `permissionCatalog.test.ts` check — and its
  defaults `page_level()`'s, which `pageAccess.test.ts` reads. A new team-only
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
- **Every rule change updates the previews too — always** (the Owner's
  standing instruction, November 2026). Whatever decides who sees or does
  something on screen reads it the way a preview narrows it: `can()`, the
  narrowed `isAdmin`/`seesAllTeams`/`roles`, `useMyTeams`/
  `useOwnMemberships` — never the real Admin flag, `isSuperAdmin` for
  something that is not the Owner's alone, or a query by the signed-in id.
  Because previews run on the Admin's own data, a screen that hides
  something from a role must hide it in the drawing too, not only rely on
  the database refusing it. Check each previewed role in `/verify` before
  the pull request, and say in it which previews were checked.
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
  lib/gettingSetUp.ts        who has set up what (0276): the table's ticks, asking
                             somebody to finish, whether their card is due
  components/Tour.tsx        the engine: walks the pages, points at `data-tour`
                             anchors, Next / Back / Skip; starts itself when due
  lib/display.ts             the screens' preferences, each falling back on its own
  lib/notificationLink.ts    every notification type: its label and its link
  lib/registrations.ts       registration events (0244): the creator's draft,
                             the owner's reads, the public page's RPCs, and
                             the door's (0247): walk-ins, proofs, today's event
  pages/DoorPage.tsx         Reception (0247): scan, find, walk-in, for whoever
                             works the door
  lib/qrPng.ts               a QR code as a PNG to download (the event's link)
  lib/registrationSteps.ts   where a registration has got to — Register, Pay,
                             Receipt, Ticket — for the progress bar (`Steps`
                             in components/Surface) on the ticket page and
                             the register form; the pay box's numbers are
                             the bar's, so the page counts steps once
frontend/api/                Vercel functions. register-preview.js answers
                             /register/<slug> to link-preview robots only
                             (vercel.json routes by user agent): title, a line
                             and the event's picture as og:/twitter: tags, read
                             through registration_public_event. Plain JS, no
                             build step; a person always gets the app.
                             manifest.js answers /manifest.webmanifest and
                             app-icon.js answers /app-icon/<set>/<file>.png:
                             the installed app's icon is the App Logo (see
                             "The installed icon" in §8). Vercel makes a
                             function of every file here that does not
                             start with `_`, tests included: helpers and
                             tests are `_name.js`
  lib/appIcon.ts             the icon set made from the App Logo: the
                             arithmetic, the canvas, the bucket; and
                             lib/useAppIconSync.ts, which keeps it current
                             from the app shell for whoever may change the logo
  components/PublicShell.tsx the frame round a page opened from a link, signed
                             in or not — no menus, the church's name and mark
  lib/pwa.ts                 install, offline, and the update banner
  lib/standing.ts            whether the app is open to this person right now
                             (0278): my_standing(), and recognising the
                             hook's app_closed among other refusals;
                             lib/useStanding.ts asks, pages/ClosedPage.tsx
                             is what a closed app shows
  lib/serviceClock.ts        the running order's countdown: what it counts to
                             now. The planner's rail and the Countdown page
                             (/countdown, 0261) both read it — never a copy
                             /countdown opens by its own cell, countdown.view
                             (0264) — every role a choice, teams and people by
                             grant — never by a level, like Reception
  auth/AuthContext.tsx       useAuth(): isAdmin, isSuperAdmin, ownerId,
                             isDepartmentHead(), ledDepartmentIds,
                             viewAs / setViewAs (an Admin's preview)
  test/select.ts             helper for driving the custom Select in tests
  public/sw.js               service worker (hand-written, not generated)
supabase/migrations/         numbered, immutable once shipped
supabase/functions/          edge functions (push-notify, invite, clock-in-address,
                             registration-email)
build/swBuildId.ts           stamps the commit into sw.js at build time
DESIGN.md                    the design system's rules — read before UI work
docs/configuration.md        every setting: what it is, where it lives, what enforces it
docs/registrations.md        how Registrations work end to end, with a flow diagram;
                             docs/registrations-overview.html is the same as a page —
                             change both together
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
- **A standing is called what `lib/roleNames.ts` calls it** — Team Head
  (never "Department Head"), Assisting Head, Team Coordinator, Team
  Member, Church Member. Read `ROLE_NAME` / `ROLE_SHORT`; do not type the
  words. `roleNames.test.ts` fails on "Department Head" anywhere in `src/`.
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
always passes `may()` — that is how a wrong setting gets put right; an
Admin edits the grid unless the church has said otherwise
(`app.permissions` is a cell like any other since 0277).
Every area is converted (0133–0144), with the defaults reproducing the
old rules exactly — each was dry-run against the live data, old rule
against `may()`, for every person and row, before it went live. Outside
the grid, because they are not rules about who: what anybody can *see*
(that follows team membership and each page's level), your own things
(your profile, your answers, withdrawing your own request, your own
feedback), and the guards that are about time rather than people
(`service_has_finished`, the checklist and debrief windows). Feedback and
"the app itself" — who is an Admin or a Head, each room of Settings, the
grid itself — were fixed until 0277, on the reasoning that whoever could
change them could hand themselves everything else; the Owner asked for
them to be the church's to give, and they are rows now. Only handing over
ownership is not: it is the Owner's own to give.

- Add `supabase/migrations/00NN_a_sentence_about_it.sql`. **Never edit a
  migration that has shipped.**
- **A right for one person, or for a team's people, is a grant** in
  `permission_grants` (0208), which `may()` already reads — not a new list
  of teams and people kept in a room. Four rooms grew such lists before
  there was one place for them; they are being folded in.
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
skipped. How each is done safely:

- **A migration** goes through three gates, in this order:
  1. *The local CI database* — a throwaway Postgres 16 with every
     migration in order and the schema check, exactly what CI runs:
     ```bash
     B=/usr/lib/postgresql/16/bin; D=/var/lib/postgresql/pgci
     su postgres -c "rm -rf $D && $B/initdb -D $D -A trust -U postgres >/dev/null && $B/pg_ctl -D $D -o '-p 55432 -k /var/lib/postgresql' -l $D.log start"
     export PGHOST=/var/lib/postgresql PGPORT=55432 PGUSER=postgres
     psql -c 'create database church_ci'
     for f in supabase/_local_test/*.sql supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d church_ci -q -f "$f" || break; done
     psql -v ON_ERROR_STOP=1 -d church_ci -f supabase/checks/sql_functions_still_match_the_schema.sql
     ```
     For a migration that decides who may do what, also run a behaviour
     script against it: redefine `auth.uid()` to read a setting
     (`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$`),
     give test people one right each through `permission_grants`, and try
     every action as each. (Inserting into `auth.users` makes the profile
     by trigger, so upsert `profiles`; the local stub has no `extensions`
     schema, so code generation fails there and nowhere else.)
  2. *A dry run on production* — the whole file inside `begin; … do $d$
     begin raise exception 'DRYRUN reached the end'; end $d$; commit;`.
     Reaching that exception means every statement ran; nothing is kept.
  3. *Apply*, then check the result with a query (the new columns,
     functions, grants), then `notify pgrst, 'reload schema';` — a new
     table answers *"Could not find the table … in the schema cache"*
     until the API reloads.
  SQL reaches production through the Management API
  (`POST /v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN`);
  never print the token.
- **An edge function** (after the Owner's yes) is deployed from the
  committed file, byte for byte — `POST
  /v1/projects/{ref}/functions/deploy?slug=<name>` as multipart
  (`metadata` with `entrypoint_path`, `name`, `verify_jwt`; `file` the
  source), or `supabase functions deploy <name>`. Keep `verify_jwt` as
  `supabase/config.toml` says. Then smoke-test it: a call with the public
  key to a kind that needs a signed-in caller must answer 401, an unknown
  kind 400.
- **The frontend is live** when the site's service worker carries main's
  commit: `curl -s https://rim-church-app.vercel.app/sw.js | grep BUILD_ID`
  equals `git rev-parse --short=12 origin/main` (main's squash-merge
  commit, not develop's).

The traps:

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
  marital status are closed to everybody; whoever holds `people.contacts`
  (the Owner alone out of the box, 0277) reads others' through
  `people_contacts()`, everyone reads their own through `my_profile()`,
  and a Head adds by address through `person_by_email()` (0126). Date of
  birth is closed too (0257): `dob` comes through `birth_dates()` (0256,
  `lib/birthDates.ts`) — the whole date for your own and for whoever the
  grid's `people.ages` ("See how old people are", 0258) gives, which is
  the Owner and Admins out of the box; only the day and month for
  everybody else. Screens decide with `can('people.ages')`, never with
  `isAdmin`. A `select('*')` on `profiles`, or any column
  not in 0127's grant (less what 0257 took back), fails the
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
- **The pre-request hook refuses for three reasons now, and the app has to
  tell them apart.** `reject_removed_user` (0070, last 0278) raises 42501
  with a `detail`: `account_removed` (signed out, `lib/accountRemoved`),
  `not_an_rpc`, and `app_closed` while a maintenance closure runs (0278).
  42501 is also every ordinary RLS refusal, so nothing may act on the code
  alone. For `app_closed` the query and mutation caches (`App.tsx`) ask
  `my_standing()` again, and `ProtectedRoute` draws `ClosedPage` in place
  of the whole app. `my_standing` is the one RPC the hook lets through
  while the door is shut; a new reason to turn people away needs the same:
  a way for the app to ask why. **Not being able to ask is never "closed"**
  (`useStanding`): a failed or slow answer opens the app, and the database
  still refuses each request. The hook's body must be copied from
  production (`pg_get_functiondef`) when it is changed, not from an old
  migration: every migration that touched it replaced all of it. Signed-out
  requests pass the hook untouched, so the registration pages stay open
  during a closure, on purpose.
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

- **The installed icon is the App Logo, and four things have to keep
  agreeing for it to stay so.** The app makes an icon set from the logo in
  the browser of whoever holds `settings.logo` (`lib/appIcon.ts`,
  `useAppIconSync` in the app shell: no button, it follows the logo) and
  stores it in the `branding` bucket at `icon/<set>/<file>`. No migration:
  that bucket is already readable by anybody and writable by that
  capability. (1) On Vercel `/manifest.webmanifest` is `api/manifest.js`,
  which names the newest set; **the build deletes the static manifest from
  Vercel's output** (`build/manifestFromFunction.ts`), because Vercel
  serves a file before it looks at a rewrite and the function would never
  be asked. (2) `public/manifest.webmanifest` and `api/_manifestBase.js`
  are two copies; `api/_appIcon.test.js` fails when they differ, so change
  both. (3) The set's file names are in `lib/appIcon.ts` and
  `api/_appIcon.js`; the same test holds them. (4) `public/sw.js` asks for
  the manifest from the network first. Cache-first there pins every phone
  to the icon of the day it installed. An iPhone takes its icon from the
  page's `apple-touch-icon` link, not the manifest, so `main.tsx` points
  that link at the set on opening. With no logo, or the database out of
  reach, everything answers with the app's own icons: never an error.
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
- **`window.open('', '_blank', 'noopener')` returns `null`.** The browser
  opens the tab but does not hand it back, so code that opens a blank tab
  and then sets its address loses it — and a fallback that navigates the
  page itself replaces the page. The receipt viewer did exactly that (a
  tab at about:blank, the event's page gone behind Back) while its test
  passed, because the test faked `window.open` returning a tab. Show the
  thing in the page, or use a real `<a href target="_blank">`; never mock
  a browser behaviour into something it does not do.
- **A test's own window listener can cancel the thing under test.** A
  capture-phase `click` listener that calls `preventDefault()` (there to
  stop jsdom following links) also stops every submit button's default,
  so no form submits and the test fails for no visible reason. Scope it to
  links: `if ((e.target as Element)?.closest('a')) e.preventDefault()`.
- **A new file can overwrite an old one of the same name.** `lib/countdown.ts`
  already existed (the service countdown); writing a new one over it broke
  three components. Check `git ls-files | grep -i <name>` before creating
  a file, and pick a name nobody has.
- **A test phone number must be one libphonenumber accepts.** UK 07700
  900xxx is the drama range and is rightly refused; use 07911 123456.
- **A SQL true/false can be null, and a strict schema then refuses the
  whole answer.** `o.refund_status = 'owed' and …` is null, not false,
  when `refund_status` is null; `z.boolean()` refused it, and the ticket
  page — which shows one "No such ticket" for every failure — told every
  attendee their link was wrong (0250 → 0252). The same null made
  `if not …` in plpgsql pass a guard it should have stopped. Write
  `x is not distinct from 'owed'` or `coalesce(…, false)` for anything a
  public function returns as a boolean or tests with `not`. And page tests
  that hand the page a ready-made object skip the schema entirely: parse a
  real production answer at least once (`lib/orderView.test.ts`).
- **The page's arithmetic and the database's have to agree to the penny.**
  `orderTotals` truncated a percentage discount where `registration_register`
  rounds (`(… / 100.0)::int`), so a 15% code on £19.99 showed £2.99 off and
  charged £3.00. Whichever side does the sum first, the other copies its
  rounding, and a test pins an odd amount.
- **A check-in is not forever.** A two-day event's ticket was "already
  checked in" on the second day, with no way to count who came. The door
  goes by `checkedInToday()`; the all-time stamp stays on the order.
- **`psql` as `postgres` ignores row security, and the local stub grants
  the app's roles nothing.** A behaviour script that counts rows as the
  superuser proves nothing about RLS; count as `anon`/`authenticated`
  (`set local role …`) after granting them the tables as Supabase does
  (`grant select, insert, update, delete on all tables in schema public to
  anon, authenticated`). The stub also has no `extensions` schema:
  `registration_new_code()` needs `extensions.gen_random_bytes`, so shim
  it from `public.gen_random_bytes` for a script that registers.
- **A countdown asserted to the second fails a second later.** Give the
  target 30 seconds of margin, or use fake timers.
- **A storage policy says who it is for.** Every policy on
  `storage.objects` is evaluated for whoever asks, a visitor included, and
  one that calls a function `anon` may not execute (`may()`,
  `registration_can()`, `can_open_page()` …) does not answer "no" — it
  raises *permission denied for function* and the whole statement fails.
  That stopped every visitor's receipt upload and the logo on the public
  pages until 0271. A policy that needs a signed-in person is written
  `to authenticated`; only `registration_proofs_insert`,
  `branding_public_select` and `registration_images_select` are for
  everybody.
- **Settings is six groups, and each setting has one home** (the Owner's
  redesign, November 2026; `lib/settingsSections.ts`): You, Access, Church,
  Pages, Tools, Owner only. A setting about one page belongs to that
  page's settings, never to the room it happened to be built beside —
  "Location on their phones" sat under Onboarding until it moved to Clock
  In. The agreed design, screen by screen, is the Settings redesign canvas
  the Owner approved; build new rooms to it.

## 9. Recipes

**A new page**: route in `App.tsx` (inside `PageGate` unless everybody may
always open it) → a rule in `lib/pageAccess.ts` `PAGE_RULES` (default,
choices, what enforces it — and, if it has a key, the same choices as
its `page.<key>` cells, in a migration and in `lib/permissions.ts`'s
`CATALOG`) → nav entry in `lib/navItems.ts` `NAV_ITEMS`,
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
`lib/appSettings.ts`. The column is Page by Page's (`settings.pages`)
unless the same migration names another room for it in
`app_setting_rooms()` (0277). **A preference only the screens read** — a key in
`lib/display.ts` (`DISPLAY_DEFAULTS` and `readDisplay`, which falls back
per key), no migration → read it with `useDisplay()`. Either way, **one
entry in `lib/settingsCatalog.ts`**: its name, one line, the long
explanation (behind "How this works"), the pages it moves (`affects`:
routes, or `BELL`/`ALERTS`/`APP`/`SERVICE_PAGES_REF`), and how to read and
write it. Page by Page shows it under its pages by itself — it is the
one room for a page's clocks, what it keeps and what it shows (Timings,
Data & Retention and Dashboard & Lists folded into it; do not bring a
second room for the same rows back). `settingsCatalog.test.ts` fails if a column or a display
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

**A setting that is the whole church's, or the Owner's alone, has a room
instead of a page.** Give its catalog entry a `room` (`GENERAL_ROOM`,
`FEEDBACK_ROOM`): `SettingsRoomCard` draws the room from the catalog and
saves only its columns, Page by Page stops drawing it, and the page it
moves points to the room in `PAGE_ROOMS` (`ownerOnly` hides a pointer
nobody else could follow). The catalog test fails if a setting ends up
drawn twice or nowhere.

**One person can be refused one thing (0273).** `permission_blocks` (a
person, a capability) is asked by `may()` before every tier, so a block
wins over role, team and grant; `decide()` mirrors it through
`Holder.blocked`. Never the Owner; an Admin cannot be blocked, and a block
on somebody later made an Admin sleeps. Written only through
`set_permission_blocks()`, from Access & Privileges › By person. Only what
`blockableCapabilities()` offers — never opening a page, whose levels the
pages draw. A new rule that answers from somewhere other than `may()`
will not honour a block: say so there, or ask `may()`.

**A right is no use behind a closed page.** `lib/pageNeeds.ts` reads the
changes waiting to be saved in Access & Privileges and names each one that
hands a role (Newcomer, Team Member, Pastor) something on a page that role
cannot open; the save review offers "Open the page for them too", which
adds the page's own capability to the same save. It only ever offers —
nothing is opened unasked. A page gated by something other than a `page.*`
capability must be told to it there (`/clock-in` by `clockin.view`).

**Every page in Page by Page reads in one order**: who can open it, the
church's rule, team by team, then its settings and the rooms it points
to. Keep a new block inside that order.

**Who can open which pages** is chosen in Page by Page, under each page.
Access & Privileges › Pages (`PageAccessCard`) only shows it — a preview
per profile and each page's level, linking to its section — so the
choice has one home and one Save.

**A new way in** to a page or an action that the grid's cells and grants
do not hold — something Overwatch reads through its own pages
(`OVERWATCH_READS` in `lib/overwatch.ts`), a page that opens by a
capability (`openingFor()`) — is also said in `lib/personAccess.ts`, or
By person will tell an Admin somebody can't do what they can.

**A new Settings room**: an entry in `SETTINGS_GROUPS`
(`lib/settingsSections.ts`) with its glyph, tone, `needs` and — since
0277, always — its own `capability` (`settings.<room>`: eight catalog
lines in a migration, the same in `lib/permissions.ts` with `given()`, a
row under "Settings & the keys" in `lib/permissionMatrix.ts`), a child
route in `App.tsx`, and a pane export in `pages/SettingsPage.tsx`. If it
writes columns of `app_settings`, name them in `app_setting_rooms()`; if
it writes a table, that table's write policies ask
`may(auth.uid(), 'settings.<room>')`; if it lists rights by team and
person, map their prefix in `permission_room()`. The pane decides with
`can()`, never `isAdmin` or `isSuperAdmin`. The
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

## 11. The routine (how the work has been run)

So a session that starts from nothing works the way the last one did:

1. **Look before building.** Read the code a request touches, and the
   live data when the question is about something that happened (a test
   order, an event's address) — the answer is often there, as with the
   "missing" payment that a 100% promo code had made free.
2. **Say the plan in a few lines first** when there is a real choice
   (a new right, who sees a link, what a delete does), make sensible
   defaults and name them, and stop only for decisions that are the
   Owner's: what a person may see, money, anything sent to people.
3. **Build it whole**: migration (through §7's three gates), the lib, the
   pages, tests for each behaviour and for each right, the docs here.
4. **Gates** (§2), then a **stub browser** run of anything a person sees
   (`frontend/.claude/skills/verify/`, or a Playwright script against
   `vite preview` of a build with `VITE_SUPABASE_URL=http://supabase.test`)
   — read the screenshots, at phone and desktop width, light and dark.
5. **Commit to `develop`, push, open the PR to `main`** — but only once
   every migration and function it needs is on production (§1). One PR at
   a time: a new piece waits for the last to merge.
6. **Watch it to deployed**: subscribe to the PR, and confirm the live
   `BUILD_ID` (§7). Then tell the Owner, briefly, what changed and what is
   still unverified (§10) — the camera, real uploads and emails cannot be
   checked here.
7. **Keep this file current** in the same commit as the change it
   describes; the vocabulary table (§3) carries what each table and
   function is for, §8 every trap that cost a real bug.

## 12. The skills installed in this repo

`.claude/skills/` holds eight skill sets copied in at a pinned commit, each
with a `SOURCE.md` saying where it came from, its licence and what was
left out: `superpowers`, `mattpocock-skills`, `ponytail`, `caveman`,
`impeccable`, `hallmark`, `i-have-adhd` and `graphify` (beside
`security-audit`, and `frontend/.claude/skills/verify`). All but
`graphify` and `security-audit` are plugin folders: they load as
`<set>@skills-dir` and their skills are called `<set>:<skill>`.

**Read the `rim-toolbox` skill before picking one.** It says which skill
fits which job here and, more to the point, where these skills are
overruled: they were written for other projects, and several say MUST
about things this file forbids (making a branch, opening a PR, writing a
one-line commit). This file wins; `rim-toolbox` lists the collisions.

- **Nothing is fetched when a session starts.** To take a newer version
  of a set, copy the new commit in, read the difference, and update its
  `SOURCE.md`. Their auto-running hooks are left out on purpose; the one
  exception is ponytail's, which its panel needs and which were read
  first (they run `git ls-files` and write flag files; no network).
- **Two panels sit above the prompt**: ponytail's own, and caveman's,
  which is written here (`.claude/skills/caveman/hooks/band/`, with tests
  in `tests/`: `claude plugin validate` and `claude plugin test` on that
  folder). Caveman starts off; a mode shapes chat replies only, never
  anything that is kept.
- **The code graph is not committed.** `graphify extract . --code-only`
  then `graphify cluster-only . --no-label` rebuilds `graphify-out/` in
  about twenty seconds with no model calls (`pip install
  "graphifyy[sql]"` first in a fresh container). `.graphifyignore` keeps
  the copied skills and built output out of it.

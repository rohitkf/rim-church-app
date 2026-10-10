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
- A merged pull request is finished. Follow-up work is a new PR.

## 2. Commands

Run from `frontend/`. All four must be clean before you push:

```bash
npx tsc --noEmit -p tsconfig.app.json    # the app
npx tsc --noEmit -p tsconfig.node.json   # vite.config.ts and build/
npx vitest run                           # ~865 tests, all must pass
npm run build                            # catches what tsc alone misses
```

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
| `user_roles.role_type` | `admin`, `department_head`, `assisting_head`, `service_flow_coordinator` |
| `services` → `service_sessions` | a service and its running order |
| `service_session_assignees` | who is taking a session — a list, one row per person |
| `announcements` | the alert an Admin sends from Settings |
| `team_messages` (`kind='alert'`) | a team alert |
| signed in, on no team (`is_on_a_team` false) | a **Church Member** |
| `rota_tags`, `rota_assignment_tags` | the rota's tags — Shadow and the church's own |
| `giving_page`, `giving_links`, `giving_bank_accounts` | the **Giving** page (Tithes & offerings) |
| `team_polls` (`audience`: everyone · team · people · service) | the **Polls** page — any audience, not only a team |
| `church_updates` | the **Church Updates** page |
| `app_feedback` (`kind`, `status`) | the **Feedback** page — about the app, not a Sunday; sent via `submit_feedback`, read and answered by the Owner alone via `mark_feedback` (0124, 0125) |
| `service_issues` | the **Issues** page — raised via `raise_issue` inside `issue_window` (Heads and Admins exempt, 0119), a Head's verdict (`outcome`, `remarks`) via `mark_issue` (0117–0119) |

Other things that are true and not guessable:

- **A "finished" service is computed, never stored.** It is finished when
  its last session's end time has passed (`lib/useFinishedServices.ts`,
  `lib/serviceProgress.ts`). Nothing sets a flag. After a grace period
  (`app_settings.edit_grace_minutes`) the database itself refuses edits.
  The one exception is the **"After the service" half of a checklist**,
  which has its own window from the end
  (`app_settings.after_service_checklist_minutes`, default 120;
  `checklist_item_writable`, 0115) — the page keeps such a service out of
  Finished until that closes.
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
  lib/permissionMatrix.ts    the Access & privileges table, hand-maintained
  lib/pageAccess.ts          who may open each page (PAGE_RULES), mirrored in SQL
  lib/display.ts             the screens' preferences, each falling back on its own
  lib/notificationLink.ts    every notification type: its label and its link
  lib/pwa.ts                 install, offline, and the update banner
  auth/AuthContext.tsx       useAuth(): isAdmin, isSuperAdmin, ownerId,
                             isDepartmentHead(), ledDepartmentIds,
                             viewAs / setViewAs (an Admin's preview)
  test/select.ts             helper for driving the custom Select in tests
  public/sw.js               service worker (hand-written, not generated)
supabase/migrations/         numbered, immutable once shipped
supabase/functions/          edge functions (push-notify, invite)
build/swBuildId.ts           stamps the commit into sw.js at build time
DESIGN.md                    the design system's rules — read before UI work
docs/configuration.md        every setting: what it is, where it lives, what enforces it
```

Routes live in `src/App.tsx`. Settings is a parent route: `/settings` is
the hall (every room, grouped), and each room is its own child route —
`profile`, `appearance`, `timings`, `retention`, `display`, `rota`,
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

- Add `supabase/migrations/00NN_a_sentence_about_it.sql`. **Never edit a
  migration that has shipped.**
- **Resolve audiences and permissions in SQL.** A client that posts its own
  list of recipients can reach anybody by editing an array. Send the
  intent; let a `security definer` function decide who that means and
  whether the caller may do it at all. `send_announcement` is the model.
- A table only ever written through an RPC gets **no insert policy**. That
  is what makes the RPC the only way in.
- Writing to `notifications` **pushes to that person's phone** (every type
  except `message`). A new notification type is a new thing that buzzes
  pockets — decide it on purpose.

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
3. **Some migrations wait for the release.** A migration that takes
   something away the live app still uses must be applied *after* that
   release is live, not before. 0127 (closing email and phone on
   `profiles`) is one: applied early, the app in production loses every
   signed-in person's own profile. Its header says so.

## 8. Things that fail silently

Each of these has already cost real time. None of them show up in review.

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

- **`public/sw.js` must keep `const BUILD_ID = '__RIM_BUILD_ID__'`.** A
  browser installs a new service worker only when `sw.js` differs byte for
  byte; without the placeholder it is identical every deploy and the "a new
  version is ready" banner can never appear. It shipped that way for 84
  deploys. The build now fails loudly if the line goes — leave that guard.
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
never seen lands in its default group, or at the top →
a wash colour in its `WASH` map → `PageHeader` with an eyebrow, like
every other page.

**A new notification type**: add it to `NOTIFICATION_TYPES` *and* the map in
`notificationLink.ts` (the type is exhaustive, so a miss is a compile
error), add the same entry to `push-notify/index.ts`, then emit it from a
migration. Remember it will push.

**A new permission**: write the policy in a migration, then add the row to
`lib/permissionMatrix.ts`. That page claims to describe the database; a
capability missing from it is the page starting to lie.

**A new app-wide setting**: first decide which kind it is
(`docs/configuration.md`). **A rule** the database must obey —
`app_settings` column with a check constraint in a migration →
`lib/appSettings.ts` → a row in the room it belongs to: Timings
(`AppSettingsCard`) for when things open and close, Data & retention
(`RetentionCard`) for what is deleted and when, Access (`PageAccessCard`)
for who sees what. **A preference only the screens read** — a key in
`lib/display.ts` (`DISPLAY_DEFAULTS` and `readDisplay`, which falls back
per key), no migration → a control in `DisplayCard` (Dashboard & lists) →
read it with `useDisplay()`. Either way the room saves through
`useSettingsDraft(keys)`, which writes only that room's columns, so no
room can undo another. A row says its name, one line and its value; the
long explanation goes in its `help`, behind "How this works". A new clock
needs its sentence in `lib/lifespan.ts`. A room is a stack of
`SectionTile`s built from `SettingRows`.

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

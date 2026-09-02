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
| `announcements` | the alert an Admin sends from Settings |
| `team_messages` (`kind='alert'`) | a team alert |

Other things that are true and not guessable:

- **A "finished" service is computed, never stored.** It is finished when
  its last session's end time has passed (`lib/useFinishedServices.ts`,
  `lib/serviceProgress.ts`). Nothing sets a flag. After a grace period
  (`app_settings.edit_grace_minutes`) the database itself refuses edits.
- **A checklist item climbs a fixed chain**, and the order never changes:
  `pending` → `member_complete` → `head_verified` → `coordinator_verified`
  (the `checklist_item_status` enum, mirrored 1:1 by the `status-*` colour
  tokens). A new stage means a new token, never a reused accent.
- **Head and Assisting Head are identical in every rule.** Do not write a
  policy that distinguishes them.
- **The Team Coordinator is a rota role, not a rank.** Whoever holds it for
  a service can sign that service's checklists off, and only then.
- **Pages show a window of days, not "the next N services"**
  (`app_settings.rota_window_days`, `lib/rotaWindow.ts`).

## 4. Where things are

```
frontend/src/
  components/Surface.tsx     the design system's primitives — start here
  components/Select.tsx      the app's dropdown (never use a native <select>)
  components/AppShell.tsx    header, dock, routes' wash colour, alert banner
  lib/queries.ts             shared Supabase reads
  lib/permissionMatrix.ts    the Access & privileges table, hand-maintained
  lib/notificationLink.ts    every notification type: its label and its link
  lib/pwa.ts                 install, offline, and the update banner
  auth/AuthContext.tsx       useAuth(): isAdmin, isSuperAdmin, ownerId,
                             isDepartmentHead(), ledDepartmentIds
  test/select.ts             helper for driving the custom Select in tests
  public/sw.js               service worker (hand-written, not generated)
supabase/migrations/         numbered, immutable once shipped
supabase/functions/          edge functions (push-notify, invite)
build/swBuildId.ts           stamps the commit into sw.js at build time
DESIGN.md                    the design system's rules — read before UI work
```

Routes live in `src/App.tsx`. Settings is a parent route with panes
(`/settings/profile|access|alerts|church|data`).

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

## 8. Things that fail silently

Each of these has already cost real time. None of them show up in review.

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

**A new page**: route in `App.tsx` → nav entry in `AppShell.tsx` `navItems`
→ a wash colour in its `WASH` map → `PageHeader` with an eyebrow, like
every other page.

**A new notification type**: add it to `NOTIFICATION_TYPES` *and* the map in
`notificationLink.ts` (the type is exhaustive, so a miss is a compile
error), add the same entry to `push-notify/index.ts`, then emit it from a
migration. Remember it will push.

**A new permission**: write the policy in a migration, then add the row to
`lib/permissionMatrix.ts`. That page claims to describe the database; a
capability missing from it is the page starting to lie.

**A new app-wide setting**: `app_settings` column in a migration →
`lib/appSettings.ts` → a control in `components/AppSettingsCard.tsx`.

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

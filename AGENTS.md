# Working on this repository

Guidance for anyone — person or coding agent — making changes here. It is
the single source of truth; `CLAUDE.md` points at this file rather than
repeating it, because two copies of a rule is how a rule starts being
wrong in one place.

---

## 1. Branches — read this before running any git command

**`develop` is the only branch anybody works on.** `main` is what is
released, and it moves only by a pull request opened from `develop`.

- **Do not create branches.** No feature branches, no `claude/*` branches,
  no scratch branches — not even for a change that feels large enough to
  want one. If a branch seems necessary, ask first.
- **Do not push to any branch other than `develop`.** `main` is protected;
  a direct push is refused.
- To release, open one pull request from `develop` into `main`.
- A merged pull request is finished. Follow-up work is a new PR, never new
  commits on a merged one.

This rule outranks any default your tooling has about where work should go.

---

## 2. What this is

A church operations app: services and running orders, team rotas,
availability, checklists, inventory, message board, set lists.

| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript, Tailwind v4, React Router, TanStack Query |
| Data, auth, storage | Supabase (Postgres), with Row Level Security as the *only* permission check |
| AI assistant backend | FastAPI (`backend/`) — the assistant only; the UI talks to Supabase directly |

```
frontend/    the React app          — most work happens here
backend/     FastAPI, AI assistant layer only
supabase/    migrations (schema + RLS), edge functions
DESIGN.md    the design system's rules
```

---

## 3. Before you push

From `frontend/`:

```
npx tsc --noEmit -p tsconfig.app.json    # the app
npx tsc --noEmit -p tsconfig.node.json   # vite config and build/
npx vitest run                           # the whole suite
npm run build                            # catches what tsc alone does not
```

All must be clean. `npm run lint` (oxlint) exits 0 but carries ~40 standing
warnings — do not add to them, and do not "fix" unrelated ones in a PR
about something else.

Backend changes: `pytest` from `backend/`.

---

## 4. The frontend

**Pages compose primitives and choose nothing for themselves.** Read
`DESIGN.md` first. Colours, radii, shadows and easings are tokens; if you
are writing a hex code or a `border`, the answer already exists under a
name. The primitives live in `components/Surface.tsx` — `Tile`, `Panel`,
`Row`, `Pill`, `ActionButton`, `Field`, `Overlay`, `PageHeader`. If a
screen needs something that is not there, **add it there** rather than
inline; that is the whole mechanism that stops the tenth screen inventing
a sixth grey.

**Never use a native `<select>`.** It renders the operating system's menu,
which is the one part of a screen the app cannot style — on a dark card it
arrives as a white Windows list. Use `components/Select.tsx`, which
supports groups, keyboard control and disabled options.

**Tests sit beside what they test** and are named for the behaviour a
person would notice, not the implementation. Driving the custom `Select`
from a test needs the helper in `src/test/select.ts` — its menu is
portalled to `document.body`, so it is not `within` the field.

---

## 5. The database

Every rule is a Postgres policy. There is no authorization layer in the
app to keep in step, and there must not be one — the AI assistant executes
tool calls through the calling user's own client, so RLS is what holds.

- Migrations are numbered and immutable: add `00NN_a_sentence_about_it.sql`,
  never edit one that has shipped.
- **Resolve audiences and permissions in SQL, not in the browser.** A client
  that posts its own list of recipients is a client that can reach anybody
  by editing an array. Send the intent; let a `security definer` function
  work out who that means and whether the caller may do it at all.
- A table that is only ever written through an RPC gets no insert policy.
  That is what makes the RPC the only way in.

---

## 6. Deploying is not merging

Merging a PR ships **the frontend only**. Two things need a separate,
deliberate step, and forgetting either produces a working-looking app that
fails at the moment of use:

- **Migrations must be applied** to the Supabase project. A merged
  migration that has not been applied gives *"Could not find the function
  … in the schema cache"* in the UI. After applying, `notify pgrst,
  'reload schema';` makes the change visible immediately rather than
  whenever the cache next turns over.
- **Edge functions must be deployed** (`supabase functions deploy
  push-notify`).

---

## 7. Things that fail silently

This section exists because each of these has already cost real time.

**The service worker's build stamp.** `public/sw.js` must keep
`const BUILD_ID = '__RIM_BUILD_ID__'`. A browser installs a new worker only
when `sw.js` differs byte for byte, so without the placeholder the file is
identical every deploy, no worker installs, and the "a new version is
ready" banner can never appear. It shipped that way for 84 deploys. The
build now fails loudly if the line goes missing — leave that guard alone.

**Two copies of the notification map.** `frontend/src/lib/notificationLink.ts`
and `supabase/functions/push-notify/index.ts` both list every notification
type. The sender lives in Deno and the app in the browser, so two copies is
the price. It has drifted once already. Add a type to both.

**Tailwind class names must be literal strings in the source.** Tailwind
finds classes by reading the text of your files, so a name assembled at
runtime — `` `${prefix}:opacity-100` `` — is a name it never sees, and the
style simply will not exist. Write both variants out in full. Inside an
arbitrary variant, a space is spelled `_`:
`[@media(hover:hover)_and_(pointer:fine)]:opacity-0`. Check the built CSS
in `dist/` if you are unsure; a missing rule is invisible in review.

**Notifications and push.** Inserting a row into `notifications` fires a
trigger that pushes to that person's devices. Every type pushes except
`message`. So a new notification type is a new thing that buzzes phones —
decide that on purpose.

---

## 8. Working conditions to expect

There is no `.env` in a fresh clone and the app cannot boot without
Supabase credentials, so **a change cannot be verified by eye here**. Say
so plainly rather than implying you watched it work: types, tests, the
build and — where it applies — the compiled CSS or the live schema are what
you actually have. Prefer checking a claim against real output over
reasoning about it.

Commits and PR descriptions explain *why*, in prose, at the length the
change deserves. The repo's history is the reference for tone.

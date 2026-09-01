# Church Operations Platform

Web app for church operational management — service planning, department
coordination, attendance, checklists, inventory, and internal communication
— with a hybrid interface: structured UI plus an AI assistant (voice/text)
that can perform the same actions.


Full requirements: see the PRD. This repo currently implements **all 9
milestones** below (Auth, Profiles, Departments/Team Planner, Attendance +
Checklists, Dashboard, Service Planner, Inventory, Message Board +
Notifications, AI Assistant), on top of the full Section 8 data
model/RLS. Visual design follows `DESIGN.md` (the "Sanctuary Ops" system).

`/checklists` still has a minimal Admin-only "create a service" form —
that predates the Service Planner and just registers a date/type quickly
when you don't need to build a full running order yet. The Service
Planner itself (`/service-planner`) is where sessions, timing, and
assignments actually get built.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query |
| Data + Auth + Storage + Realtime | Supabase (Postgres) |
| AI assistant backend | FastAPI — Claude (`claude-opus-5`) tool-calling agent + self-hosted Whisper STT |
| Permission enforcement | Supabase Row Level Security — the assistant executes every tool call through the *calling user's own* Supabase client, so RLS is the only permission check that exists; there's no separate authorization logic to keep in sync |

Manual UI actions talk directly to Supabase; FastAPI is only in the loop for
the AI assistant, per the architecture note in the PRD.

## Structure

```
frontend/    React app (Vite) — Dockerfile builds a static nginx image
backend/     FastAPI service — AI assistant layer only — Dockerfile builds a uvicorn image
supabase/    SQL migrations (schema + RLS policies)
docker-compose.yml   Runs both containers together for local/self-hosted deployment
```

## Key decisions locked in from the PRD's Open Questions

1. **Assisting Head**: view-only + checklist verification rights — not full
   parity with Department Head (cannot edit roster/handbook/inventory).
2. **Sensitive fields** (visa type, DBS status, visa expiry): visible only
   to Admin and the individual themselves — not Department Heads. Enforced
   by splitting these into a separate `profile_sensitive` table with its
   own RLS policy (Postgres RLS is row-level, not column-level).
3. **Cross-department dashboard metrics**: Department Heads can read
   attendance % / checklist % for *other* departments (read-only), even
   though department content (roster, handbook, inventory) stays scoped to
   that department's own members per FR12.4.

## Getting started

### Supabase

1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations/` in order (via the
   Supabase CLI `supabase db push`, or paste them into the SQL editor in
   order — they're numbered).
3. Promote your first user to Admin (there's no UI for this yet, by
   design — bootstrapping the first Admin is a one-time manual step):
   ```sql
   insert into public.user_roles (user_id, role_type)
   values ('<the user''s auth.users id>', 'admin');
   ```
4. The `handbooks` and `avatars` Storage buckets are created by
   `0008_storage_handbooks.sql` along with their RLS policies — no manual
   bucket setup needed.
5. `0009_realtime.sql` adds `messages` and `notifications` to the
   `supabase_realtime` publication so the notification bell and message
   board update live — no manual Realtime toggle needed either.

`supabase/_local_test/` holds stub `auth`/`storage` schemas used only to
dry-run these migrations against a bare Postgres instance in CI — they are
not part of the real migration set and must never be applied to an actual
Supabase project (real Supabase already provides `auth`/`storage`).

### Frontend

```
cd frontend
cp .env.example .env   # fill in your Supabase project URL + anon key
npm install
npm run dev
```

### Backend (AI assistant service)

```
cd backend
cp .env.example .env   # fill in Supabase URL/anon key + your Anthropic API key as LLM_API_KEY
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run tests: `pip install -r requirements-dev.txt && python -m pytest`. Tests
mock the Anthropic client and Supabase responses — no real API key or
network access needed to run them.

## Testing & data validation

- **Backend**: 31 pytest tests — the agent loop (mocked Anthropic client:
  simple replies, tool execution, the destructive-action pause/resume),
  tool executors (RLS-denial handling, unknown-tool handling, a fake
  Supabase client), auth gating on every assistant endpoint (missing/bad
  tokens *and* the success path via `dependency_overrides`), Whisper
  transcription (mocked model, lazy-load-once behavior), and `Settings`
  parsing. No real Anthropic/Supabase/Hugging Face network calls anywhere
  in the suite.
- **Frontend**: 34 Vitest + React Testing Library tests — the time/
  relative-time helpers, the `SegmentedProgressBar`/`StatusBadge`
  components, `ErrorBoundary`, `NotFoundPage`, `AuthContext`'s per-
  department/per-service role-check logic (mocked Supabase client), and
  the Zod schemas themselves (accept-valid / reject-malformed cases).
- **Runtime data validation**: every Supabase response the frontend
  handles is parsed through a Zod schema (`src/lib/types.ts`,
  `src/auth/types.ts`) instead of a plain TypeScript `interface` cast. A
  TypeScript type only checks shapes at compile time — it does nothing
  once data actually arrives over the network, so a schema drift (a
  renamed column, a join that started returning null, a bad manual
  `as unknown as X` cast) would previously have produced silent
  `undefined` fields in the UI instead of a caught, debuggable error.
- Still missing: true end-to-end tests (Playwright/Cypress) driving the
  real UI against a real Supabase instance, and — as noted above — the
  Whisper transcription path has never run against real audio in the
  environment this was built in.

#### AI Assistant (Phase 9)

**Currently gated off in the UI** — see `VITE_AI_ASSISTANT_ENABLED` below.
The backend is fully built and tested, just not deployed yet; the sidebar
button shows a "Coming Soon" badge instead of a working chat panel until
you deploy the backend and flip the flag. Everything below describes what
it does once enabled.

Click "AI Assistant" in the sidebar to open the chat panel. It's a manual
Claude tool-calling loop (`app/agent.py`), not the SDK's beta tool runner,
specifically so it can *pause* before a destructive action instead of just
executing it:

- **Tools** (`app/tools/`): a representative set covering Sections 9–15 —
  checklist status/verification (all three stages), attendance logging,
  team/service lookups, inventory, and message board posting — not
  literally every manual action in the PRD (FR16.2 in full is much larger).
  Adding another tool is mechanical: a schema entry, an executor, and (if
  destructive) a `DESTRUCTIVE_TOOLS` listing.
- **Permission enforcement (FR16.3)**: every tool executes through the
  calling user's own Supabase client. There is no separate "can this user
  do X" check in the tool code — an unauthorized action simply fails as an
  RLS error, which comes back to Claude as a normal tool error.
- **Confirmation (FR16.4)**: `delete_checklist_item` and
  `delete_inventory_item` are destructive tools — the loop pauses on them
  and returns a `pending_actions` list to the frontend instead of
  executing, which renders Confirm/Cancel buttons; confirming calls
  `POST /assistant/confirm` to actually run it.
- **Voice input (Open Question 4 decision)**: self-hosted
  [faster-whisper](https://github.com/SYSTRAN/faster-whisper) rather than
  the browser's Web Speech API, for cross-browser consistency. The model
  downloads from Hugging Face on first transcription request (not at
  server startup) and is cached afterward — the first voice request after
  a fresh deploy will be slow. `WHISPER_MODEL_SIZE` (default `base`)
  trades accuracy for speed/RAM.
- The chat API is stateless per-request — the frontend holds conversation
  history and echoes it back each turn (`ChatRequest.history` /
  `AssistantResponse.history`) rather than the backend persisting
  sessions. Refreshing the page starts a new conversation.

### Enabling the AI Assistant

The assistant is built and tested but ships **disabled** — `frontend/
.env.example` sets `VITE_AI_ASSISTANT_ENABLED=false` by default, which
shows the sidebar button as a greyed-out "Coming Soon" state (see
`AppShell.tsx`) instead of opening a panel that would fail every request
because there's no backend to call. Everything else in the app (Phases
1–8) works fully without the backend deployed at all.

To turn it on: deploy the backend (see Docker/Render sections below), set
`VITE_API_BASE_URL` to that backend's URL, set
`VITE_AI_ASSISTANT_ENABLED=true`, and redeploy the frontend — both are
build-time Vite vars. No other code changes needed either direction.

### Docker

Runs both services as containers — no local Node/Python toolchain needed.
Supabase itself is still a separate hosted project (this repo doesn't
self-host Supabase's Postgres/Auth/Storage/Realtime stack — see the
architecture note in Section 7 of the PRD for why).

```
cp .env.example .env   # fill in your Supabase project URL, anon key, service role key
docker compose up --build
```

- Frontend: http://localhost:8080 (nginx serving the static Vite build)
- Backend: http://localhost:8000 (`/health` for a liveness check)

`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are **build-time** args (Vite
bakes them into the JS bundle) — changing them means rebuilding the image,
not just restarting the container. Everything else is a normal runtime env
var. Both Dockerfiles run as a non-root user and declare a `HEALTHCHECK`.

The backend image installs `faster-whisper` for voice transcription, but
the Whisper model itself downloads from Hugging Face on first use, not at
build time (see the AI Assistant section below) — the sandbox this repo
was built in couldn't reach Hugging Face either, so that download path,
and transcription against real audio, has never actually run here. It's
ordinary code following faster-whisper's documented API, but budget time
to verify it against a real recording before relying on it.

### Branches

Two, both long-lived, and nothing else:

| Branch | Vercel | What it is |
| --- | --- | --- |
| `develop` | Preview | Where work lands. Every push builds a preview deployment to try the change on a real phone before it is anyone's problem. |
| `main` | Production | What the church is using. Reached only by pull request from `develop`, never pushed to directly. |

CI runs on a push to either and on every pull request, so a change is
tested on `develop` and again on the way into `main`.

A pull request into `main` **merges itself once CI is green** (the
`Auto-merge` workflow). It merges only when the pull request is open and
not a draft, GitHub reports no conflict, every check on the head commit has
finished with none failed, and no reviewer has asked for changes; otherwise
it writes a notice saying which of those stopped it. To hold one back by
hand, label it `do-not-merge` — or open it as a draft.

It runs on `workflow_run` rather than as a step inside CI on purpose: a job
that can push to production must not be one a pull request can rewrite, and
`workflow_run` always runs the copy of the workflow already on the default
branch.

### Deploying now: frontend-only on Vercel + Supabase

This is the current recommended path — Phases 1–8 (everything except the
AI assistant) work fully on just these two, at $0/month on free tiers.

**1. Supabase** — set up first (see the Supabase section above), and add
your Vercel domain to **Authentication → URL Configuration → Site URL /
Redirect URLs** in the Supabase dashboard once you have it, or email
confirmation links will point at `localhost`.

**2. Frontend (Vercel)**
- New Project → import this repo.
- Root Directory: `frontend`. Framework preset: Vite (auto-detected).
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  Leave `VITE_AI_ASSISTANT_ENABLED` unset (defaults to disabled).
- Deploy. `frontend/vercel.json` handles the SPA rewrite (client-side
  routes like `/departments/123` resolve to `index.html` on a hard
  refresh instead of 404ing) — already in the repo, no setup needed.

> **The `/sb` rewrite.** `vercel.json` also forwards `/sb/*` to the
> Supabase URL. It is the app's second road to the same server, for
> networks that carry some requests to the API host and silently drop
> others — a real failure we hit, where every GET and CORS preflight
> arrived and every POST, sign-in included, did not. The browser sits on
> a request that was thrown away and the server never knows it was
> asked. Going out through this origin instead means a different
> destination address, a different TLS session, and no cross-origin
> request at all. The app only uses it when the direct route stops
> answering (see `src/lib/supabaseRoute.ts`).
>
> The destination is written out in full there, so **if you change
> `VITE_SUPABASE_URL`, change that rewrite to match** — otherwise the
> fallback still points at the old project.

That's the whole deployment. The AI Assistant button shows as "Coming
Soon" in the sidebar until you do the steps below.

### Exporting the volunteer roll

The Volunteers page has an **Export** button, Admin only. It builds an
Excel workbook in the browser — nothing is sent anywhere — with a sheet
per question people actually ask of this data: one row per person, one
row per membership (the shape you sort and filter), and a count per team.
Tick the teams you want or take the lot.

Compliance details — visa type, visa expiry, DBS status — are off by
default and come on their own sheet when switched on. That file is
personal data with none of the app's permissions attached to it once it
is on someone's laptop; treat it accordingly.

### Later: deploying the backend to enable the AI Assistant

Vercel is a poor fit for this specific backend — it doesn't run the
`backend/Dockerfile` as-is, and `faster-whisper`'s dependencies
(ctranslate2, onnxruntime) risk exceeding serverless function size
limits, with cold starts reloading the Whisper model on nearly every
request. Use a Docker-native host instead (Render used here; Fly.io/
Railway work the same way).

**1. Backend (Render)**
- New → Web Service → connect this GitHub repo.
- Root Directory: `backend`. Render auto-detects `Dockerfile`.
- Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `LLM_API_KEY` (your Anthropic key),
  `CORS_ORIGINS_RAW` (your Vercel frontend URL).
- Health check path: `/health`.
- Deploy. Render gives you a URL like `https://church-backend.onrender.com`.
- Free tier spins down on inactivity — the first request after idling
  will be slow (cold start, plus a Whisper model download on the very
  first transcription request ever).

**2. Frontend (Vercel) — update your existing project, don't recreate**
- In the existing Vercel project's environment variables, add
  `VITE_API_BASE_URL` (the Render URL from step 1) and set
  `VITE_AI_ASSISTANT_ENABLED=true`.
- Redeploy — these are build-time Vite vars, so a redeploy (not just a
  restart) is required for the change to take effect.

**3. Close the loop** — go back to Render and set `CORS_ORIGINS_RAW` to
your real Vercel URL (including any preview-deployment domains you want
to allow), then redeploy the backend.

## Installing it as an app (PWA)

The frontend is an installable progressive web app, so a volunteer can put
it on a phone's home screen and use it like a native app rather than as a
bookmark.

**What's in the box**

- `frontend/public/manifest.webmanifest` — name, standalone display, theme
  colours and shortcuts straight to Checklists, Availability, Rota and
  Messages.
- `frontend/public/sw.js` — a hand-written service worker. It caches the
  app shell and the hashed build assets and *nothing else*: every Supabase
  call goes to the network untouched, because a cache that served one
  volunteer another's rota would be worse than having no offline support.
- `frontend/public/offline.html` — shown only when a page has never been
  opened on that device.
- `scripts/generate_icons.py` — the icons are
  generated from geometry rather than committed as opaque binaries. Re-run
  `python3 scripts/generate_icons.py` after changing the brand colour.

**Installing**

- *Android / Chrome / Edge* — the browser offers it, and there's an
  "Install app" entry in the avatar menu.
- *iOS / Safari* — Apple has no install prompt; the same menu explains the
  Share → "Add to Home Screen" gesture.

**Offline behaviour.** Pages you've already opened keep working without a
connection and a banner says so; anything that writes will fail until
you're back, which the banner also says. Offline *editing* is deliberately
not supported — queued writes against a permissions model this granular
would need conflict resolution nobody has specified.

The worker deliberately does **not** call `clients.claim()`: claiming a
page that is still loading fires `controllerchange` in the middle of that
load, which the page cannot tell apart from a real update. It takes over
on the next navigation instead, so offline support begins from the second
visit.

**Shipping an update.** Deploys are picked up automatically: the worker
notices the new build, and the app offers a "Reload" rather than swapping
the page out from under someone mid-edit. If you ever need to invalidate
every cache at once, bump `CACHE_VERSION` in `sw.js`.

`sw.js` and the manifest must never be served with a long cache lifetime —
a bad worker would pin itself onto every installed device. Both
`vercel.json` and `nginx.conf` set `max-age=0, must-revalidate` for them.

## Notifications

Every notification in the bell is a link to the page it came from —
`frontend/src/lib/notificationLink.ts` holds the one map from type to
sentence to destination, so a new notification type cannot be added without
answering "where does this take me?". Opening one marks it read.

Phone notifications come in two halves, and the first works with nothing
but permission:

**While the app is running** — including a backgrounded tab or a minimised
installed app — a notification arriving over Realtime is shown to the
system by the service worker. Permission is asked for from a button at the
foot of the bell panel, never on load, because browsers only honour the
request from a gesture and iOS only honours it at all in an installed app.

**While the app is closed** needs Web Push, which needs three things set
up once:

1. **Run the migration.** `supabase/migrations/0039_push_subscriptions.sql`
   adds one row per device, readable and removable only by its owner.
2. **Generate a VAPID key pair** — `npx web-push generate-vapid-keys`. The
   public half becomes `VITE_VAPID_PUBLIC_KEY` in the frontend's
   environment; the private half stays server-side.
3. **Deploy the sender and point a webhook at it:**

   ```sh
   supabase functions deploy push-notify
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
     VAPID_SUBJECT=mailto:you@example.org
   ```

   Then add a Database Webhook (Database → Webhooks) on
   `public.notifications`, event **INSERT**, calling the `push-notify`
   function with the service-role key as its `Authorization` header.

Until step 2 is done the app simply doesn't offer the closed-app half — no
broken button, no error. `supabase/functions/push-notify/index.ts` sends to
every one of a person's devices and deletes any endpoint the push service
reports as gone (404/410), so uninstalled apps clean themselves up.

Payloads carry only the type and a path — never a name or anything else
that would end up readable on a lock screen. The one exception is an alert a
head wrote themselves, which is text they deliberately sent to that person's
phone.

### Chasing people, and being chased

Three things send a notification to someone other than yourself, and all
three go through SECURITY DEFINER functions rather than an insert policy: a
policy permissive enough to let a head write rows *for other people* is a
policy that lets anyone write rows for anyone.

- **"Remind the N who haven't answered"** on the Availability page, per team
  per service. Core members only — a guest is helping out, not someone who
  owes an answer every week.
- **"Remind whoever hasn't finished"** on Checklists. It chases the member's
  own stage only: an item waiting on a head's verification is not the
  member's problem, and telling them otherwise teaches people to ignore the
  app. An Admin can chase every team on a service at once; a head only their
  own.
- **An alert from the message board** (`TeamAlertPanel`, Admins and heads
  only) — free text to the whole team, or to just the people one service
  needs: anyone rostered on it plus anyone who said yes or maybe. Someone
  who already said no is not chased about a service they answered for.

Nobody is sent the same nudge twice within six hours, and the sender never
nudges themselves — so a head who is the last one not to have answered gets
told "only you left to answer" rather than a phantom success.

**Every Friday and Saturday at 8pm** the database asks anyone who still
hasn't answered availability for a service in the next three days. That is a
`pg_cron` job (`rim-availability-reminder` in `0040`), scheduled at 19:00
UTC for 20:00 UK summer time — change the cron line if the church is
somewhere else. It shares the manual nudge's de-duplication, so someone
nudged by their head at 6pm is not asked again at 8.

### Live activity

The dashboard's "Live activity" panel is a real feed of what has happened on
a service: who said they can serve, who turned up, who was put on the rota,
what changed in the running order, what was ticked or signed off, what was
posted. Three decisions hold it together (`0041`):

- **Rows are written by triggers, never by the client.** A feed the app
  writes to is a feed the app can lie in; one the database writes from the
  rows themselves cannot disagree with what actually happened. There is no
  insert or update policy on `activity` at all.
- **Everything is pinned to a service**, and the panel shows one service at
  a time. During a Sunday the only activity that matters is that Sunday's.
  A board post has no service of its own, so it is filed against the next
  one coming up — which is what a post is about.
- **It clears every Tuesday**, on the same pg_cron schedule as the message
  board, because it is a rolling picture rather than an archive. An Admin
  can also clear it by hand for everyone, from the panel.

Anyone signed in can read the feed; only an Admin can delete from it. The
wording lives in `frontend/src/lib/activity.ts`, not in the database, so it
can be changed without a migration — the triggers record a bare token and
the sentence is built in code.

Undoing something is its own event, not a fall back to a stage name: a
checklist trigger compares the stage an item left with the stage it reached,
so coming back down reads "un-ticked", "took their verification off",
"took the sign-off off" rather than "pending" (`0042`).

The panel is a fixed window that scrolls, not a list that grows: on a busy
Sunday this fills faster than anything else on the dashboard, and a panel
that pushes the rest of the page down is worse than one you scroll.

### When a service overruns

The running order cascades — each session starts when the one before it was
due to finish — which is right until Worship runs ten minutes long and every
time after it is wrong.

An Admin says so with **Session started**, on the session the service is
actually waiting to begin. That session takes the current time and every
session after it moves along with it. The session before it then shows how
far it ran over, in red, under its own time.

Nothing extra is stored to know that. The plan and the clock only disagree
once someone presses the button, and the size of the disagreement *is* the
overrun: `overrunMinutes` reads it straight out of the gap between when a
session was due to end and when the next one really began.

The button sits on the session the clock says is *running*, not the next
one, and that is the whole trick: the next session's start is by definition
still in the future, so setting it to now could only ever move it earlier
and an overrun would never be recordable at all. If nobody presses anything,
the timeline runs on the plan exactly as before.

## CI

`.github/workflows/ci.yml` runs on every push/PR: frontend lint +
typecheck + Vitest + build, backend pytest, a migrations job that applies
every file in `supabase/migrations/` against a throwaway Postgres 16
service container — so a broken migration or RLS policy fails CI before
it reaches Supabase — and a docker job that builds both images and
validates `docker-compose.yml`.

## Milestones

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth + roles | ✅ |
| 2 | User profiles | ✅ |
| 3 | Departments + team planner | ✅ |
| 4 | Attendance + checklist workflow | ✅ |
| 5 | Dashboard | ✅ (no live Realtime push yet — lands with Phase 8) |
| 6 | Service planner | ✅ |
| 7 | Inventory | ✅ |
| 8 | Message board + notifications | ✅ |
| 9 | AI assistant | ✅ built, **disabled in the UI** until the backend is deployed — see AI Assistant section above |
| — | Installable PWA + mobile layout | ✅ |

## Not yet done for a real production deployment

- **A concrete hosting target** — Docker images exist and build in CI, but
  nothing pushes them to a registry or deploys them anywhere (no Fly.io/
  Render/ECS/k8s manifests, no reverse proxy or TLS termination config).
  That's intentionally left open until you pick where this actually runs.
- **Realtime on checklist/attendance views** — the notification bell and
  message board are live (Phase 8), but the Dashboard and Department Prep
  pages still require a manual refresh to see another user's update; wiring
  those to Realtime too is straightforward but not done.
- **Rate limiting / abuse protection** on the AI assistant endpoints — it
  now calls a real, billed LLM API, and there's currently nothing stopping
  a user from hammering `/assistant/chat`. Worth adding before a real
  deployment (e.g. per-user request throttling).
- **Assistant chat isn't persisted or streamed** — history lives in the
  browser tab (lost on refresh) and responses arrive as one JSON blob, not
  streamed tokens. Fine for a v1 chat panel, not ideal for longer replies.
- **Assistant tool coverage is representative, not complete** — see the AI
  Assistant section above. Department/service-planner CRUD via chat isn't
  wired up, for instance.
- **End-to-end tests** — unit/component test coverage exists on both
  sides now (see the Testing & data validation section above), but no
  Playwright/Cypress suite drives the real UI against a real Supabase
  instance yet.
- **Runtime frontend config** — `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  are baked in at Docker build time. Fine for a single deployment target;
  if you need one image promoted across multiple environments, that needs
  switching to a runtime-injected config (e.g. an entrypoint script writing
  a `config.js` the app reads at load time) instead.

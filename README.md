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
| 9 | AI assistant | ✅ (representative tool set — see AI Assistant section above) |

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

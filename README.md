# Church Operations Platform

Web app for church operational management — service planning, department
coordination, attendance, checklists, inventory, and internal communication
— with a hybrid interface: structured UI plus an AI assistant (voice/text)
that can perform the same actions.

Full requirements: see the PRD. This repo currently implements **Phases 1–7**
of the milestones below (Auth, Profiles, Departments/Team Planner,
Attendance + Checklists, Dashboard, Service Planner, Inventory), plus the
full Section 8 data model/RLS so later phases build on stable foundations.
Visual design follows `DESIGN.md` (the "Sanctuary Ops" system).

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
| AI assistant backend | FastAPI (LLM orchestration + tool execution only — Phase 9) |
| Permission enforcement | Supabase Row Level Security, mirrored by FastAPI when the assistant acts on a user's behalf |

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

### Backend (AI assistant service — not yet wired up, Phase 9)

```
cd backend
cp .env.example .env   # fill in Supabase + LLM provider keys
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run tests: `pip install -r requirements-dev.txt && python -m pytest`

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

## CI

`.github/workflows/ci.yml` runs on every push/PR: frontend lint + typecheck
+ build, backend pytest, a migrations job that applies every file in
`supabase/migrations/` against a throwaway Postgres 16 service container —
so a broken migration or RLS policy fails CI before it reaches Supabase —
and a docker job that builds both images and validates `docker-compose.yml`.

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
| 8 | Message board + notifications | Schema/RLS ready, UI pending |
| 9 | AI assistant | Backend skeleton only |

## Not yet done for a real production deployment

- **A concrete hosting target** — Docker images exist and build in CI, but
  nothing pushes them to a registry or deploys them anywhere (no Fly.io/
  Render/ECS/k8s manifests, no reverse proxy or TLS termination config).
  That's intentionally left open until you pick where this actually runs.
- **Realtime subscriptions** (Section 15/16 — live checklist views,
  notification bell) — schema/RLS is ready, the frontend doesn't subscribe
  yet (lands with Phase 8).
- **Rate limiting / abuse protection** on the FastAPI service — deferred
  until the AI assistant (Phase 9) actually calls an LLM API worth
  protecting.
- **End-to-end tests** — only a handful of backend unit tests exist; no
  Playwright/Cypress suite against a real Supabase instance yet.
- **Runtime frontend config** — `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  are baked in at Docker build time. Fine for a single deployment target;
  if you need one image promoted across multiple environments, that needs
  switching to a runtime-injected config (e.g. an entrypoint script writing
  a `config.js` the app reads at load time) instead.

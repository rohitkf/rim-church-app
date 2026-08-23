# Church Operations Platform

Web app for church operational management — service planning, department
coordination, attendance, checklists, inventory, and internal communication
— with a hybrid interface: structured UI plus an AI assistant (voice/text)
that can perform the same actions.

Full requirements: see the PRD. This repo currently implements **Phase 1
(Auth + roles)** and **Phase 2 (User profiles)** of the milestones below,
plus the full Section 8 data model/RLS so later phases build on stable
foundations.

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
frontend/    React app (Vite)
backend/     FastAPI service — AI assistant layer only
supabase/    SQL migrations (schema + RLS policies)
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

## Milestones

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth + roles | ✅ |
| 2 | User profiles | ✅ |
| 3 | Departments + team planner | Schema/RLS ready, UI pending |
| 4 | Attendance + checklist workflow | Schema/RLS ready, UI pending |
| 5 | Dashboard | Schema/RLS ready, UI pending |
| 6 | Service planner | Schema/RLS ready, UI pending |
| 7 | Inventory | Schema/RLS ready, UI pending |
| 8 | Message board + notifications | Schema/RLS ready, UI pending |
| 9 | AI assistant | Backend skeleton only |

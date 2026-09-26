---
name: verify
description: Run the real built frontend in Chromium against a stubbed Supabase, to observe a change at its UI surface when there is no .env and no login.
---

# Verify the frontend at runtime

There is no `.env` and no test login, so the app is built against a fake
Supabase host and every request to it is answered in the browser by
Playwright. Real bundle, real router, real React Query, real CSS; only the
backend is fixtures.

1. Build against the fake host (from `frontend/`):
   `VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_ANON_KEY=anon-test npx vite build --outDir <scratch>/verify-dist`
2. Serve it: `npx vite preview --outDir <scratch>/verify-dist --port 4411 --strictPort &`
3. Drive with Playwright — see `drive.example.mjs` next to this file:
   - `addInitScript` seeds `localStorage['sb-supabase-auth-token']` with a
     session whose `expires_at` is in the future (the key comes from the
     host's first label: `supabase`).
   - `context.route('http://supabase.test/**')`: `/auth/v1/*` → the user;
     `/realtime/*` → abort; `/rest/v1/<table>` → fixture rows by table;
     requests with `Accept: …pgrst.object…` get one row, or a 406
     `PGRST116` when there is none.
   - The profile fixture needs `onboarded_at` and `welcomed_at` set, or
     ProtectedRoute shows the joining form instead of the page.
4. Screenshot at 412px and 1100px. Stop the preview server by PID when done
   (`pkill -f "vite preview"` also matches, and kills, the calling shell).

Gotchas:
- `NODE_PATH` does not reach ESM imports. Import Playwright by absolute path:
  `/opt/node22/lib/node_modules/playwright/index.mjs`, with
  `executablePath: '/opt/pw-browsers/chromium'`.
- Times render in the container's UTC, so a 23:59 Europe/London deadline
  shows as 10:59pm during BST. That is the environment, not the app.

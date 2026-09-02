# Setting this up from a fork

Start to finish, in order. Following it exactly gets you a running church
app with your own database, your own accounts and nothing shared with
anybody else's copy.

Roughly 30 minutes, most of it waiting for a Supabase project to build.

> **Four things bite forks specifically.** They are steps 4, 5, 7 and 10
> below. If you skip them the app still starts, which is what makes them
> easy to miss: you get an app with no Owner, invitations that fail, and —
> if you deploy to Vercel unchanged — a fallback route pointing at the
> original author's database.

---

## Before you start

| You need | Why |
|---|---|
| Node 20 or newer (22 is what this is developed on) | the frontend |
| A [Supabase](https://supabase.com) account (free tier is enough) | database, auth, storage |
| The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | applying migrations, deploying functions |
| Python 3.11+ | **only** if you want the AI assistant |

---

## 1. Get the code

```bash
git clone https://github.com/<you>/rim-church-app.git
cd rim-church-app/frontend
npm install
```

## 2. Create a Supabase project

In the dashboard: **New project**. Pick a region near your church and save
the database password somewhere — you will not be shown it again.

From **Project Settings → API**, copy:

- the **Project URL** (`https://<ref>.supabase.co`)
- the **anon / public** key
- the **service_role** key (secret — never put it in the frontend)

## 3. Apply the migrations

Every table, every permission rule and every scheduled job lives in
`supabase/migrations/`. They are numbered and must run in order.

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

No CLI? Open the SQL editor and paste each file in `supabase/migrations/`
in filename order, oldest first. There are 75; do not skip any, and do not
reorder them.

> `supabase/_local_test/` is **not** part of this. Those are stub
> `auth`/`storage` schemas so CI can dry-run the migrations against a bare
> Postgres. Applying them to a real project will break it.

**Check it worked** — in the SQL editor:

```sql
select count(*) from public.departments;   -- 0 rows, no error
```

An error here means the migrations did not all apply.

## 4. Create your own account first — order matters

Start the app before granting yourself anything:

```bash
cd frontend
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from step 2, then:

```bash
npm run dev
```

Open http://localhost:5173, **sign up**, and confirm your email. (Supabase
sends a confirmation by default. To skip that while testing: **Authentication
→ Sign In / Providers → Email → Confirm email**, off.)

You now exist as a user with no powers at all. That is expected.

## 5. Make yourself Admin **and** Owner

This is the step forks miss, because the README used to name only half of
it. Admin and Owner are different things:

- **Admin** runs the church's app — everything, everywhere.
- **Owner** is the one account that cannot be removed, the only one that
  can take Admin away from somebody else, hand ownership on, or erase all
  the data.

A fresh database has **no Owner**, and nothing creates one for you. Without
this, Settings → Erase data never appears, "Remove admin" and "Transfer
ownership" never appear, and you will think they are broken.

In the SQL editor, replacing the email with yours:

```sql
-- Admin
insert into public.user_roles (user_id, role_type)
select id, 'admin' from auth.users where email = 'you@example.org';

-- Owner (the row that step above does not create)
insert into public.app_owner (user_id)
select id from auth.users where email = 'you@example.org'
on conflict (only_row) do nothing;
```

**Check it worked**: reload the app. Settings should now list *Access &
privileges*, *Send an alert*, *App settings* and *Erase data*. All four
means Owner; the first three only means you got Admin but not Owner — run
the second statement again.

## 6. Make the church exist

In the app: **Teams → create a team**, give it roles, then **Service
Planner → New service**. Nothing is seeded, deliberately — an empty diary
is the honest starting state.

At this point the app works for you and anybody you send a signup link to.
The remaining steps are for the parts that reach outside the browser.

---

## 7. Invitations (needed to add anybody by email)

Inviting somebody uses the service-role key, which must never reach a
browser, so it lives in an edge function.

```bash
supabase functions deploy invite
supabase secrets set SITE_URL=http://localhost:5173
```

`SITE_URL` is where the emailed link lands — set it to your real domain
once deployed. Also add that domain under **Authentication → URL
Configuration → Redirect URLs**, or the link in the email will refuse to
sign anyone in.

**Check it worked**: Volunteers → Invite. A failure here is almost always
the function not being deployed.

## 8. Phone notifications while the app is closed

Skip this and notifications still work *while the app is open* — the bell,
and the alert banner. Only the locked-phone half needs setting up.

```bash
npx web-push generate-vapid-keys          # gives you a public and private key
supabase functions deploy push-notify
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:you@example.org
```

Put the **public** half in `frontend/.env` as `VITE_VAPID_PUBLIC_KEY`.

Then the piece no migration can do for you — **Integrations → Webhooks →
Create a new hook**:

| Field | Value |
|---|---|
| Table | `public.notifications` |
| Events | **Insert** only |
| Type | Supabase Edge Function |
| Function | `push-notify` |
| Headers | *Add auth header with service key* |

(Webhooks moved out of the Database section; parts of Supabase's own docs
still link the old path.)

**Check it worked**: on a phone, install the app, allow notifications, then
have somebody send you an alert from Settings. Nothing arriving usually
means the webhook header is missing.

## 9. The AI assistant (optional)

It is built and switched off. Leave `VITE_AI_ASSISTANT_ENABLED=false` and
the Ask button politely says "coming soon".

```bash
cd backend
cp .env.example .env      # Supabase URL + keys, and LLM_API_KEY (Anthropic)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then set `VITE_AI_ASSISTANT_ENABLED=true` and `VITE_API_BASE_URL` in the
frontend's `.env`.

---

## 10. Deploying

### Change `vercel.json` first

`frontend/vercel.json` contains a rewrite pointing at **the original
author's Supabase project**:

```json
{ "source": "/sb/:path*", "destination": "https://optfeyksexpokamihksp.supabase.co/:path*" }
```

That is a fallback route the app uses when a network drops POSTs to
Supabase (see `lib/supabaseRoute.ts`). **Replace the host with your own
project ref** or, on the day some volunteer's mobile network trips the
fallback, their sign-in will be attempted against a database you do not
own.

### Then

Import the repo into Vercel, root directory `frontend`, and add
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_VAPID_PUBLIC_KEY`
as environment variables. The build command and SPA rewrites are already
in `vercel.json`.

Add your Vercel domain to **Authentication → URL Configuration**, and
update the `SITE_URL` secret from step 7.

Docker is an alternative: `docker-compose.yml` builds the frontend behind
nginx and the backend under uvicorn.

---

## Deploying changes later

Merging a pull request ships **the frontend only**. Two things stay manual:

1. **Apply new migrations** — `supabase db push`. A merged-but-unapplied
   migration shows *"Could not find the function … in the schema cache"* to
   the user. After applying, run `notify pgrst, 'reload schema';` so it
   takes effect at once.
2. **Redeploy changed edge functions** — `supabase functions deploy <name>`.

---

## When something is wrong

**"Could not find the function … in the schema cache"** — a migration has
not been applied. Run `supabase db push`, then `notify pgrst, 'reload
schema';`.

**Settings shows only three sections** — you have Admin but not Owner. Run
the second statement in step 5.

**"Only an Admin can …"** on everything — the `user_roles` insert did not
match your account. Check the email in that statement against `auth.users`.

**The invite button fails** — the `invite` function is not deployed (step 7).

**No push on a phone, but the bell works** — the webhook is missing or has
no service-key header (step 8). The in-app half never needed it, which is
why this looks like a partial failure.

**Emails arrive but the link will not sign you in** — the domain is not in
Authentication → URL Configuration, or `SITE_URL` is stale.

**Everything is empty and you are sure it should not be** — check the
project ref in `.env` matches the one you applied migrations to. Two
Supabase projects, one populated and one not, is a common half-hour.

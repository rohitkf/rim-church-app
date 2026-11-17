# CLAUDE.md

**Read [AGENTS.md](./AGENTS.md) before making changes.** It holds all of
it: the branch rule, the commands that must pass, what the domain words
mean, where things live, the design system's rules, how permissions work,
and the handful of things in this repo that fail silently.

This file is deliberately a pointer and not a second copy. The repository
already carries an apology in its own source for two lists of notification
types that fell out of step — a second list of house rules would go the
same way.

## The six that apply every session

1. **Work on `develop`, and only `develop`.** Never create a branch. Never
   push to `main` — it is protected and moves only by a pull request.
   When work is implemented and verified, **open that PR to `main` without
   being asked** (AGENTS.md §1) — but **only after any migration or edge
   function it needs is already on production**. Applying a migration is
   pre-approved once it has passed AGENTS.md §7's gates; deploying an edge
   function, and sending anything to real people, still need the user's
   explicit yes each time. The PR auto-merges and deploys; a frontend
   ahead of its database is a broken page for everybody.
2. **Start by listing the open pull requests, and take Dependabot's.**
   Any that are open are read, tried and merged into `develop` as part of
   the session (AGENTS.md §1) — pre-approved. Say in the report what was
   open, even when it was nothing.
3. **Before pushing**, from `frontend/`: `npx tsc --noEmit -p
   tsconfig.app.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx
   vitest run`, `npm run build`. All clean, every time.
4. **Keep the tour up to date.** A change to what a page does, what a
   button is called or who a page is for changes its step in
   `frontend/src/lib/tour.ts` in the same commit; a new page, Settings
   room or preview fails `lib/tour.test.ts` until the tour has it
   (AGENTS.md §5).
5. **Keep View as up to date, role by role.** Whatever decides who sees
   or does something on screen reads it the way a preview narrows it, a
   new standing gets a preview in the change that makes it, and each
   previewed role is checked before the pull request (AGENTS.md §3).
6. **The app cannot boot here** — there is no `.env`. So nothing can be
   verified by eye. Check claims against real output (tests, the build,
   `dist/`, the live schema) and say plainly what is still unverified.

# CLAUDE.md

**Read [AGENTS.md](./AGENTS.md) before making changes.** It holds all of
it: the branch rule, the commands that must pass, what the domain words
mean, where things live, the design system's rules, how permissions work,
and the handful of things in this repo that fail silently.

This file is deliberately a pointer and not a second copy. The repository
already carries an apology in its own source for two lists of notification
types that fell out of step — a second list of house rules would go the
same way.

## The three that apply every session

1. **Work on `develop`, and only `develop`.** Never create a branch. Never
   push to `main` — it is protected and moves only by a pull request.
2. **Before pushing**, from `frontend/`: `npx tsc --noEmit -p
   tsconfig.app.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx
   vitest run`, `npm run build`. All clean, every time.
3. **The app cannot boot here** — there is no `.env`. So nothing can be
   verified by eye. Check claims against real output (tests, the build,
   `dist/`, the live schema) and say plainly what is still unverified.

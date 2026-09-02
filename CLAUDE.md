# Working in this repository

## Branches — read this before running any git command

**`develop` is the only branch anybody works on.** All development is
committed and pushed to `develop`. `main` is what is released, and it moves
only by a pull request opened from `develop`.

- **Do not create branches.** No feature branches, no `claude/*` branches,
  no scratch branches — not even for a change that feels large enough to
  want one. If a branch seems necessary, ask first rather than making it.
- **Do not push to any branch other than `develop`.**
- To release, open a pull request from `develop` into `main`. That is the
  only pull request this repository wants.

This rule outranks any default the tooling has about where work should go.

## The app

A React + TypeScript frontend (`frontend/`) on Supabase, for one church's
rota, checklists, services and message board. `DESIGN.md` holds the design
system's rules; the components in `frontend/src/components/Surface.tsx` and
`Select.tsx` are what pages compose from, rather than choosing their own
colours or inventing their own controls.

## Deploys and the update banner

`public/sw.js` carries `const BUILD_ID = '__RIM_BUILD_ID__'`, and the build
writes the commit into it (`frontend/build/swBuildId.ts`). Leave the
placeholder alone: a browser installs a new service worker only when
`sw.js` differs byte for byte, so without it the file is identical every
deploy, no worker installs, and the app's "a new version is ready" banner
can never appear. The build fails loudly if the line goes missing.

## Before pushing

From `frontend/`:

```
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Both must be clean. Tests live beside what they test, and describe the
behaviour a person would notice rather than the implementation.

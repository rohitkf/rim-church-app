# CLAUDE.md

Everything for working in this repository — the branch rule, the commands
that must pass, the design system, the database conventions, and the
handful of things here that fail silently — lives in **[AGENTS.md](./AGENTS.md)**.

Read it before making changes. It is deliberately the only copy: a rule
written down twice is a rule that will be wrong in one of the two places.

## The one thing to know before any git command

`develop` is the only branch anybody works on. Do not create branches. Do
not push to `main` — it is protected, and it moves only by a pull request
from `develop`.

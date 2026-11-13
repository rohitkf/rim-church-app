---
name: rim-toolbox
description: Use at the start of any piece of work in this repository (a feature, a bug, a design pass, a database rule, a review, a report) to choose which installed skills to use, in what order, and where this repo's house rules overrule them. Also use when asked "which skill", "how should we do this" or "use the skills".
---

# Working here with the installed skills

Eight skill sets are installed in `.claude/skills/` (each folder's `SOURCE.md` says where it came
from and what was left out). They were written for other projects. This file says how they fit
this one.

## Who wins when they disagree

1. What the Owner says in the conversation.
2. `AGENTS.md` and `CLAUDE.md`.
3. This file.
4. Any installed skill.

A skill that says MUST is still fourth. The collisions that matter:

| A skill says | Here |
| --- | --- |
| Make a branch or a worktree (`superpowers:using-git-worktrees`, `superpowers:finishing-a-development-branch`) | Never. Work on `develop` (AGENTS §1). |
| Open or merge a PR when the work is done | Only by AGENTS §1: `develop` to `main`, after any migration is live, one at a time. `mattpocock-skills:pr` may shape the body. |
| Publish specs, tickets or triage labels (`to-spec`, `to-tickets`, `triage`, `wayfinder`, `setup-matt-pocock-skills`) | No issue tracker is set up. The plan lives in the conversation's task list. Do not create issues unless the Owner asks. |
| Interview the person question by question (`superpowers:brainstorming`, `grill-me`, `grilling`, `grill-with-docs`) | Do the thinking; ask only what the Owner alone can decide. Run a full interview when the Owner asks to be grilled. |
| Send work to subagents (`dispatching-parallel-agents`, `subagent-driven-development`, `caveman:cavecrew`) | Only when the Owner asks for it or the session's own rules allow it. |
| Write the commit as one compressed line (`caveman:caveman-commit`) | Take its subject line. Keep the body: commits here explain why, in prose, and end with the attribution lines. |
| Write a plan or a spec to a file | Only when the Owner asks for the file. Otherwise the plan is said and tracked in the task list. |
| Pick a theme, a typeface or a new look (`hallmark`, `impeccable`) | The app has a design system (`DESIGN.md`, AGENTS §5): the device's own typeface, the app's tokens. Use these skills to judge and polish against it, never to replace it. |

The voice modes (`caveman`, `ultracave`, `megacave`, `i-have-adhd`, ponytail's reply style) shape
replies in the chat. They never touch what is kept: the app's own wording, code comments, commit
messages, PR bodies, migrations, `AGENTS.md`.

## Which skill for which job

| Job | Use, in this order |
| --- | --- |
| Find what a change touches | `graphify` (see below), then read the files it names |
| Shape a feature before building | `superpowers:brainstorming` for the design, `superpowers:writing-plans` when it has more than a few steps |
| Build | `ponytail:ponytail` rules: reuse what exists, the smallest change that fully does the job. Logic in `frontend/src/lib` test-first with `superpowers:test-driven-development` (or `mattpocock-skills:tdd`; pick one, they say the same) |
| A bug or a failing test | `superpowers:systematic-debugging` first. A hard one or a slow path: `mattpocock-skills:diagnosing-bugs` |
| A screen that looks wrong | `frontend:verify` sweep to see it, then `impeccable:impeccable audit` and `critique` on the page, fix with the app's tokens, `impeccable:impeccable polish`, sweep again |
| A new public page (registration, ticket) | `hallmark:hallmark` in its audit or redesign verb as a second opinion; the app's tokens still decide |
| A database rule (policy, `may()`, a grant) | AGENTS §6 route, a per-role behaviour script, then `security-audit` on what changed |
| Before saying it is done | `superpowers:verification-before-completion`, which here means AGENTS §2's four commands, `frontend:verify`, and for a migration the local run and the dry run |
| Review before pushing | `ponytail:ponytail-review` (is every line needed, is the risky part tested), then `/code-review`. `superpowers:receiving-code-review` when a reviewer answers |
| Whole-repo health | `ponytail:ponytail-audit`; `security-audit` for a security pass; `mattpocock-skills:improve-codebase-architecture` when the Owner wants the structure looked at |
| A short video about the app | `brag:brag` (AGENTS §12): screens from the built app on `/verify`'s fixtures, in the theme asked for; output to the scratch directory, never the repo |
| Editing `AGENTS.md`, `CLAUDE.md` or a skill | `mattpocock-skills:writing-for-agents`, `superpowers:writing-skills` |
| The conversation is getting long | `mattpocock-skills:handoff` |
| The Owner did not follow a reply | `mattpocock-skills:wait-what`; offer `i-have-adhd:i-have-adhd` for the rest of the session |

## The usual run of a feature

1. `graphify` for what it touches; read `AGENTS.md` §3 for the words the app uses.
2. Design it (`superpowers:brainstorming`), asking only for real choices. More than a few steps: a plan in the task list (`superpowers:writing-plans`).
3. Build it small (`ponytail:ponytail`), logic test-first.
4. If it has a screen: AGENTS §5, then `impeccable:impeccable polish` on what changed.
5. Verify (`superpowers:verification-before-completion` with this repo's gates). Say what was not verified.
6. Review (`ponytail:ponytail-review`, `/code-review`; `security-audit` if rules or sign-in changed).
7. Commit with the why, push `develop`, and follow AGENTS §1 and §7 for the PR and the deploy.

## graphify here

- The graph is not committed. Build it: `graphify extract . --code-only`, then
  `graphify cluster-only . --no-label`. About 20 seconds, no model calls. If `graphify` is missing:
  `pip install "graphifyy[sql]"` (the `sql` part puts the migrations in the graph).
- `.graphifyignore` keeps other people's code and built output out of it.
- Ask it before a change that crosses the database and the app:
  `graphify explain "usePermissions()"`, `graphify affected "public.profiles"`,
  `graphify path "A" "B"`. A SQL function redefined by several migrations is one node per migration:
  name the newest one.
- It reads structure, not meaning. It finds who calls what; it does not know the house rules.

## The two panels

- **caveman** (`off · caveman · ultracave · megacave` and `Commit · Review · Stats · Compact`): starts
  off. A switch reaches the model beside the next prompt. Stats are measured, never estimated.
- **ponytail** (`off · lite · full · ultra` and `Copy · Review · Audit · Board · Compact`): ponytail's
  own. Its hooks start a session at `full` unless `PONYTAIL_DEFAULT_MODE` says otherwise.

Reports and anything the Owner will keep are written in plain prose whatever the panels say.

## If a skill name is not listed in a session

The sets load as plugins from `.claude/skills/<set>/`, and their skills are called `<set>:<skill>`.
Where a session has not loaded them, read the skill's file directly:
`.claude/skills/<set>/skills/<skill>/SKILL.md` (Matt Pocock's are under
`skills/engineering/` and `skills/productivity/`).

## Things that are not obvious

- `impeccable`'s first step runs a launcher that downloads its engine. If the network refuses it,
  work from `skills/impeccable/reference/*.md` instead.
- `hallmark`'s picture generation needs a Together AI key; do not use it here.
- `brag` needs the Hyperframes npm package, which is not installed here: `brag/SOURCE.md` has the
  commands, with telemetry off. Its `publish`, `share`, `cloud`, `auth` and `feedback` are never run.
- `caveman:caveman-compress` rewrites a memory file in caveman style and sends its text to a model.
  Never run it on `AGENTS.md` or `CLAUDE.md` unless the Owner asks: those are the house rules, in
  the house's own prose.
- Auto-running hooks from these sets are not installed (each `SOURCE.md` lists them), except
  ponytail's, which its panel needs.

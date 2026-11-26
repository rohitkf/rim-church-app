Copied from https://github.com/pbakaus/impeccable at commit 2fc5e1459efb (tag skill-v4.11.1) on 2026-11-26, from `plugin/skills/`. Licence: Apache-2.0 (see LICENSE).

**Copied:** the impeccable skill as the Claude Code plugin ships it (SKILL.md, reference/, scripts/).

**Left out:** the SessionStart, PostToolUse and Stop hooks that run its checker after every edit, and the copies for other agents. Note: the skill's own first step runs scripts/impeccable, a launcher that downloads the project's engine binary (checked against engine-checksums.txt) the first time it is used. That happens only when somebody uses the skill.

Nothing here is fetched at run time by Claude Code: this folder is the whole install, and it
changes only when somebody copies a newer commit in and reads the difference.

**Updated 2026-11-24, 4.8.2 → 4.10.0** (from commit c1e0e5492fbb, 2026-11-11). Before copying, the
folder matched upstream's `plugin/skills/` at the old commit exactly, so there were no local edits
to carry over. The changes, read before they came in:
- The engine the launcher downloads moves from 0.1.22 to 0.1.27. It still comes from the project's
  GitHub releases and is checked against `scripts/engine-checksums.txt`. The launcher itself did not change.
- `live-browser.js` (the Live mode overlay) gives its buttons a 44px target on touch screens, and
  Live no longer comes back on a reload right after you leave it.
- New: `/impeccable foundations` (`reference/foundations.md`), a read-only checklist of a project's
  basics (secrets kept out of the repo, a 404 page, icons, CI that runs tests and others). It
  reports and offers to fix one item at a time. Its secrets check names file and line, never the key.
- `critique.md` split its rubric out into `critique-rubric.md`, and `new-work.md` split into
  `new-work-comp.md` and `new-work-world.md`. A motion reviewer joins the degraded-mode helpers.
  The rest is prose in the reference playbooks.
- Nothing new runs by itself. The plugin's hooks and agents are still left out, as before.


Tried after the copy: the launcher fetched engine 0.1.27 and checked it against the pinned checksum.
`detect --json frontend/src` gives the one known finding (the stage plan's dashed label strip, which
is a drawing). `foundations` gives 8 of 14. Its "secret in the repository" is
`frontend/src/lib/registrationEmailNews.test.ts:79-80`, which is the example secret Svix publishes in
its own documentation. The test checks our signature code against Svix's worked example. It is
public and not a key, so leave it as it is.

**Updated 2026-11-26, 4.10.0 → 4.11.1** (from commit b49177d32788). Before copying, the folder matched
upstream's `plugin/skills/` at the old commit exactly; after it, it matches the new one exactly.
Thirteen files changed, none added or removed. Read before they came in:
- The engine the launcher downloads moves from 0.1.27 to 0.1.31, still from the project's GitHub
  releases and still checked against `scripts/engine-checksums.txt`.
- The launcher itself changed this time, so every line of it was read. It reports why a download
  failed (curl's or wget's own message), and before a download it deletes its own half-finished
  ones (`.impeccable.part.*` in its cache folder, an hour idle, their process gone). It reads and
  writes nothing outside that cache folder, and fetches from nowhere new.
- 4.10.0 told the agent to open its first message with "Run `npx impeccable login`". 4.11.1 takes
  that line out. Upstream now has an account that saved critiques and audits can be sent to; that
  only happens for somebody who has run `impeccable login`. **Nobody has here, and it is not to be
  run**: a report would leave this machine. Signed out, reports are saved in the project as before.
- A saved critique or audit records the page's title, and a critique its ten scores. Live mode
  stops polling after three half-hour waits with nothing from the page and says so, and a steer
  sent while the agent is busy is queued and not lost.
- Nothing new runs by itself. The plugin's hooks and agents are still left out, as before.

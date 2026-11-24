Copied from https://github.com/pbakaus/impeccable at commit b49177d32788 (tag skill-v4.10.0) on 2026-11-24, from `plugin/skills/`. Licence: Apache-2.0 (see LICENSE).

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

Copied from https://github.com/pbakaus/impeccable at commit c1e0e5492fbb on 2026-11-11. Licence: Apache-2.0 (see LICENSE).

**Copied:** the impeccable skill as the Claude Code plugin ships it (SKILL.md, reference/, scripts/).

**Left out:** the SessionStart, PostToolUse and Stop hooks that run its checker after every edit, and the copies for other agents. Note: the skill's own first step runs scripts/impeccable, a launcher that downloads the project's engine binary (checked against engine-checksums.txt) the first time it is used. That happens only when somebody uses the skill.

Nothing here is fetched at run time by Claude Code: this folder is the whole install, and it
changes only when somebody copies a newer commit in and reads the difference.

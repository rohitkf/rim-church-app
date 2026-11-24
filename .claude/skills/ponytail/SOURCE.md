Copied from https://github.com/DietrichGebert/ponytail at commit ebd8654c2c62 on 2026-11-24. Licence: MIT (see LICENSE).

**Copied:** the six skills, the commands, the plugin manifest, the band (hooks/band, the panel above the prompt) and the hooks the band depends on (they keep the current level in a flag file and add ponytail's rules at session start).

**Left out:** adapters for other agents, benchmarks, docs, tests, translations. The hooks were read before copying: they run git ls-files and write flag, config and ledger files under the user's config folder; they open no network connection. The band posts a task row to a webhook only if somebody sets one, and none is set.

Nothing here is fetched at run time by Claude Code: this folder is the whole install, and it
changes only when somebody copies a newer commit in and reads the difference.

**Updated 2026-11-24** (from 96608e078b2d). These are the hooks that run in every session, so every
line was read. Three hooks now decode stdin as UTF-8 (a character split across two chunks was
garbled). The band's import skips one unreadable subagent log instead of losing the rest. There is
no new behaviour, file or network use.

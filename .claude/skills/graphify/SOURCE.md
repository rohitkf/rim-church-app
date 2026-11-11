`SKILL.md` is the skill file shipped inside the `graphifyy` 0.9.106 package from PyPI (what
`graphify install` copies into `~/.claude/skills/graphify/`), from
https://github.com/safishamsi/graphify. Licence: Apache-2.0 (see LICENSE and NOTICE).

**Copied:** the skill file only.

**Left out:** `graphify claude install`, which adds an always-on section to CLAUDE.md and a hook that
steers every search through the graph. Here the graph is used when somebody asks for it, and
AGENTS.md says where it is.

The skill needs the `graphify` command. A fresh container does not have it: the skill's first step
installs it with `pip install graphifyy` when it is missing. The project's graph is not committed
(`graphify-out/` is in `.gitignore`): it is rebuilt from the code with
`graphify extract . --code-only`, which reads the code on this machine and calls no model.

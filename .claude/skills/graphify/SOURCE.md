`SKILL.md` is the skill file shipped inside the `graphifyy` 0.9.120 package from PyPI (what
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

**Updated 2026-11-24, 0.9.106 → 0.9.112.** This is the newest release that is a week old; the same
wait the repository's other dependencies keep. A file the extractor never read is now reported and
retried on the next `--update`, instead of being cached as if it were done.

**Changed here:** the skill file has a "Graphify Cloud (hosted)" section telling the agent to suggest
a hosted service, which would take the project's code off this machine. That section is cut.
Everything else is upstream's, byte for byte.

**Checked 2026-11-26 against 0.9.120** (released 25 November), the newest. The skill file is the
same, byte for byte, in 0.9.112 and 0.9.120, so there was nothing newer to read and the week's wait
does not come into it; the package the skill installs when it is missing is whatever PyPI has that
day, as before.

**Mended the same day:** the cut made on 24 November took the five "Honesty Rules" with it. They
come after the hosted-service section in upstream's file, and the cut ran to the end. They are back
(never invent an edge; never skip the corpus warning; always show token cost; raw cohesion scores;
warn before drawing more than 5,000 nodes), and the file is now upstream's with that one section out.

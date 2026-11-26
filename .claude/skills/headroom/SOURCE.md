Copied from https://github.com/headroomlabs-ai/headroom at commit ce0460cfa859 (version 0.45.0) on 2026-11-23 (checked on 2026-11-24 and again on 2026-11-26 against c9d7eae7e625: upstream's later commits leave the skill unchanged, and 0.45.0 is still the newest `headroom-ai`).
Licence: Apache-2.0 (see LICENSE and NOTICE).

Headroom makes what is sent to a model smaller before it is sent: long logs, tables of rows, tool
output. It comes as a Python library, a proxy that sits between a coding agent and the model, an
MCP server, and three Claude Code plugins. The Owner asked for it to be added and always used
(23 November 2026). This says which parts are, and why the others are not.

**Copied:** the `headroom` skill (`plugins/headroom-skill/skills/headroom/SKILL.md`, unchanged), which
is how to add `compress()` to an app of one's own. The manifest is upstream's with the name changed
from `headroom-skill` to this folder's, so the skill is `headroom:headroom`.

**Installed beside it, not in this folder:** the library itself, `headroom-ai` 0.45.0 from PyPI, in a
tool environment of its own (`uv tool install --python 3.13 "headroom-ai==0.45.0"`, about 360 MB, a
few seconds). The Owner's cloud environment installs it when a session's machine is built. Only the
version of `headroom-ai` is pinned; what it depends on is whatever PyPI gives that day.

**Written here (not upstream):** `scripts/hr` at the root of the repository, which is how this
repository uses it: `scripts/hr <command>` runs a command and prints its output through Headroom's
`compress()`. It keeps the command's exit code, keeps the whole output in a file and says where,
prints the output untouched when Headroom would save less than a tenth or is not installed, and
runs Headroom with its beacon off and its network off (`HEADROOM_BEACON=off`, `HEADROOM_OFFLINE=1`).
AGENTS.md §12 says when to use it.

**Left out, and why:**

- **The proxy** (`headroom wrap claude`, `headroom proxy`, `headroom init`, `headroom deploy`). This
  is the part that makes everything smaller without being asked, and it cannot be attached from
  inside this repository: it works by starting Claude Code pointed at an address on the same
  machine, and a cloud session is started by Anthropic's side, already pointed at its own. Pointing a
  session somewhere else from a settings file would put a program nobody here has run in the path of
  every message, rewriting the conversation as it goes, and a session whose proxy was not up would
  not start at all. On a computer of one's own it is one command, and it is the Owner's to run:
  `uv tool install --python 3.13 "headroom-ai[all]"`, then `HEADROOM_BEACON=off headroom wrap claude`.
- **`headroom-agent-hooks`**: a hook at the start of every session and before every shell command
  that keeps that proxy alive. Nothing to keep alive here.
- **`headroom-snip`**: a band above the prompt that shows what the proxy cut. With no proxy it shows
  a line saying there is none.
- **The MCP server** (`headroom mcp serve`: `headroom_compress`, `headroom_retrieve`,
  `headroom_stats`). `headroom_compress` takes the text to make smaller as its argument, so the
  model has to write out again, at the price of output, what it has already read. `scripts/hr`
  makes the output smaller before the model reads it, which is the only place there is anything to
  save.
- **`headroom learn`**, which writes what it thinks went wrong into `CLAUDE.md` or `AGENTS.md`. Those
  are the house rules, written by hand.
- The rest of the repository: the Rust crates, the SDKs, the benchmarks, the docs site.

**The usage beacon is on by default upstream.** It reports compression ratios, counters, model names
and the operating system, not prompts or files. `scripts/hr` turns it off every time. Anybody who
runs `headroom` by hand should set `HEADROOM_BEACON=off` (or `DO_NOT_TRACK=1`) first.

**What it writes on the machine:** `~/.headroom/ccr_store.db`, the originals of what it made smaller,
kept for an hour so they can be asked for again. `scripts/hr` also keeps each whole output in the
temporary folder. Rows from the live database that go through it are therefore on the session's
machine in both places until it is thrown away, as they already are in the conversation.

Nothing here is fetched at run time by Claude Code: this folder is the whole install of the skill,
and it changes only when somebody copies a newer commit in and reads the difference.



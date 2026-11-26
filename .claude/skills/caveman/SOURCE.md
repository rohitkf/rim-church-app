Copied from https://github.com/JuliusBrussee/caveman at commit 47c61be2d10a (after cli-v4.2.0) on 2026-11-24.
Licence: Apache-2.0 (see LICENSE and NOTICE).

**Copied:** the skills `caveman`, `ultracave`, `megacave`, `caveman-compress` and `cavecrew` and the three
`cavecrew-*` agents (from `plugins/caveman/`), and `caveman-commit`, `caveman-review` and `caveman-help`
(from `skills/`).

**Left out:** upstream's Node hooks, which turn caveman on at the start of every session and track the
mode on every prompt; its status line, engine, proxy, browser extension and the rest of the repository;
and the `caveman-stats` skill, which only prints what one of those hooks hands it.

**Written here (not upstream):** `hooks/band/register.tsx`, `hooks/hooks.json`, `types/index.d.ts` and
the manifest. That module is the caveman band: the row above the prompt with
`off · caveman · ultracave · megacave` and `Commit · Review · Stats · Compact`. It does the work the
left-out hooks did, inside Claude Code and with nothing running on the side:

- the mode is kept for the session and starts **off**;
- on a switch, the mode's own `SKILL.md` goes to the model beside the next prompt, and later prompts
  carry one line saying it is still on, so the system prompt (and its cache) is never touched;
- typing `/caveman`, `/ultracave`, `/megacave`, `stop caveman` or `normal mode` moves the band too;
- Stats, and the `/caveman-stats` command, show output tokens a turn with a mode on and with it off,
  as measured in the session. Nothing is estimated, and there is no figure until both have happened.

Nothing here is fetched at run time: this folder is the whole install, and it changes only when
somebody copies a newer commit in and reads the difference.

**Updated 2026-11-24** (from 3dc497a). Only the copied skills were compared. The band, the manifest
and the types are this repository's own and did not change. Four files moved:
- `cavecrew`: a section on briefing subagents (exact paths, no mode-switching keywords, git config
  kept repo-local).
- `caveman-compress`: an optional Codex CLI provider, used only when configured. It runs in an
  isolated profile with no network, no filesystem and no tools. The default Claude model moves from
  Sonnet 4.5 to 4.6.
- `validate.py`: a check that compression changed no number (values, versions, signs), with spelled-out
  numbers allowed to become digits. It is pure text, with no network.

**Checked 2026-11-26 against e74a11ccdb38** (25 November): nothing copied here changed upstream since 47c61be2d10a.

Copied from https://github.com/JuliusBrussee/caveman at commit 3dc497a (version 4.1.0) on 2026-11-11.
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

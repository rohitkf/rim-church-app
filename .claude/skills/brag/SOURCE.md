Copied from https://github.com/latent-spaces/brag at commit 669ab9286aa2 on 2026-11-13. Licence: MIT (see LICENSE).
The bundled music is not MIT: "Happy Beats / Business Moves Vol. 10" by Sascha Ende, ende.app, CC BY 4.0. A video
that uses it carries the credit "Music: Sascha Ende, ende.app (CC BY 4.0)". The sound effects are Kenney's (CC0).

**Copied:** the brag skill (SKILL.md, slim.md, references/, scripts/, assets/sfx/, and one music track with its
cues) and brag-slim (SKILL.md).

**Left out:** four of the five music tracks (Vol. 1, 9, 11 and 12, 11 MB between them) and their cue files;
`assets/music/README.md` still lists them. The example sites and their videos, the launch site (`docs/`), and the
manifests for other agents.

**What it needs that is not in this folder:** the Hyperframes renderer, which the full `/brag` drives. It is an
npm package and nothing here installs it. For a run: `npm i hyperframes@0.9.41` in a scratch directory (not in
this repository), then call it with `HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1` and
`HYPERFRAMES_BROWSER_PATH` set to a Chrome headless shell already on the machine. Its own skills (the composition
contract the brag skill says to read) come inside the package, under `dist/skills/`. Never run its `publish`,
`share`, `cloud`, `auth` or `feedback` commands: they send things off the machine.

Nothing here is fetched at run time by Claude Code: this folder is the whole install, and it
changes only when somebody copies a newer commit in and reads the difference.

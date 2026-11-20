Copied from https://github.com/heydamir/unslop at commit 620163eedb35 on 2026-11-20. Licence: CC BY 4.0 (see LICENSE). By Damir Sokolovsky (@heydamir); the licence asks that the credit stay in any copy or adaptation, and each file carries it.

**Copied:** the unslop skill (SKILL.md, references/ with its reference pictures, scripts/).

**Left out:** its tests, the example pages, the marketplace manifest and the copy for another agent (agents/openai.yaml). Note: scripts/snapshot.mjs saves a live page as one HTML file and scripts/story.mjs renders a short video of a screen being unslopped; both drive a local browser with Playwright, story.mjs also needs ffmpeg, and neither sends anything anywhere. Nothing calls them unless the skill is asked for a snapshot or a story video.

Nothing here is fetched at run time by Claude Code: this folder is the whole install, and it
changes only when somebody copies a newer commit in and reads the difference.

Copied from https://github.com/cloudflare/security-audit-skill, `skills/security-audit/`. Licence: MIT (see LICENSE).

**Copied:** every file of the skill, and the licence.

**Left out:** the repository's README.

It was added on 20 November 2026 with no note of where it came from. On 26 November 2026 every file
here was compared with upstream's newest commit, c1c8a8c14710 (14 September 2026, "Clarify guidance
and full audit modes"): all the same, byte for byte, and upstream has no file this folder lacks. So
this is that commit, and it is current.

`validate-findings.cjs` and `validate-coverage-ledger.cjs` are run with Node by the skill's own
workflow, on files the audit writes; they read no network.

Nothing here is fetched at run time by Claude Code: this folder is the whole install, and it
changes only when somebody copies a newer commit in and reads the difference.

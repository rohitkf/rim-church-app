/**
 * The migration this build needs the database to have reached (0285).
 *
 * The house rule is a migration first, then the app that needs it: the
 * pull request merges itself and deploys, and an app ahead of its database
 * is a broken page for everybody. The rule was kept by hand, and the other
 * order has shipped before ("Could not find the table 'public.stage_layouts'",
 * October 2026). So the app is built knowing the number it needs, the
 * database says the number it has (`schema_version()`, through
 * `health()`), and three things read the pair: the app itself, which says
 * "being updated" instead of breaking (lib/databaseVersion); CI, which
 * will not let a release merge ahead of production (ci.yml, `database`);
 * and Settings › App Health.
 *
 * It is a number written here rather than counted from the files at build
 * time on purpose: the Docker image is built from frontend/ alone, where
 * there are no migrations to count. `migrationLedger.test.ts` holds it to
 * the files, so adding a migration and forgetting this fails the build.
 */
export const SCHEMA_NEEDS = 288

/**
 * The first migration that must wait until this release is live, or null
 * (nearly always). A migration that takes away something the app in
 * production still uses is applied *after* the release, not before
 * (AGENTS.md §7, trap 3) — so the release must not ask for it. Name it
 * here and SCHEMA_NEEDS stays one below it; set it back to null in the
 * release after.
 */
export const SCHEMA_WAITS: number | null = null

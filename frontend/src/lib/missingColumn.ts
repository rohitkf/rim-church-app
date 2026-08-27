/**
 * Whether a rejection is Postgres saying a column isn't there (42703).
 *
 * The app ships ahead of its migrations: a deploy can reach the browser
 * before someone has run the SQL that adds a column. Rather than showing a
 * page-breaking "column profiles.anniversary does not exist", the callers
 * of this fall back to what the database does have.
 */
export function isMissingColumnError(err: unknown, column?: string): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  if (code !== '42703') return false
  if (!column) return true
  return typeof message === 'string' && message.includes(column)
}

/**
 * Where somebody was going when they were sent to sign in: ProtectedRoute
 * passes it along, and LoginPage goes there once they are in.
 *
 * Only ever a place inside the app — a path that starts with one slash.
 * Anything else (nothing, a full address, "//somewhere", a backslash, the
 * sign-in page itself) is the Dashboard.
 */
export function whereTheyWereHeaded(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return '/'
  if (from === '/login' || from.startsWith('/login?') || from.startsWith('/login#')) return '/'
  return from
}

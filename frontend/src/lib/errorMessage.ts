/**
 * Pulls a human-readable message out of whatever was thrown.
 *
 * Supabase rejects with a plain object (`{ message, details, hint, code }`),
 * not an `Error`, so an `err instanceof Error` check silently discards the
 * one piece of information worth showing — the caller sees a generic
 * fallback and has no idea what actually failed.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message

  if (typeof err === 'object' && err !== null) {
    const { message, details, hint } = err as Record<string, unknown>
    if (typeof message === 'string' && message.trim()) {
      // Postgres puts the useful specifics in `details`/`hint`; include the
      // first one that says something the message doesn't.
      const extra = [details, hint].find(
        (x): x is string => typeof x === 'string' && !!x.trim() && x !== message,
      )
      return extra ? `${message} — ${extra}` : message
    }
  }

  if (typeof err === 'string' && err.trim()) return err

  return fallback
}

import { ZodError } from 'zod'
import { noAnswerText } from './networkFailure'

/**
 * Pulls a human-readable message out of whatever was thrown.
 *
 * Supabase rejects with a plain object (`{ message, details, hint, code }`),
 * not an `Error`, so an `err instanceof Error` check silently discards the
 * one piece of information worth showing — the caller sees a generic
 * fallback and has no idea what actually failed.
 */
export function errorMessage(err: unknown, fallback: string): string {
  // What the database sent did not have the shape the app expects. Zod's
  // own message is every mismatch as a page of JSON; the first one, said
  // in a line, is what whoever fixes it needs.
  if (err instanceof ZodError) return shapeMismatch(err)
  // A request that got no answer. The client passes it on with the stack
  // of the failed fetch as its `details` — a screenful of script
  // addresses that says nothing to anybody, where one sentence does.
  const noAnswer = noAnswerText(err)
  if (noAnswer) return noAnswer
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

function shapeMismatch(err: ZodError): string {
  const [first, ...rest] = err.issues
  if (!first) return 'The data that came back was not in the shape the app expects.'
  const where = first.path.length > 0 ? first.path.map(String).join('.') : 'the answer itself'
  const more = rest.length > 0 ? ` (and ${rest.length} more)` : ''
  return `The data that came back was not in the shape the app expects: ${where} — ${first.message}${more}`
}

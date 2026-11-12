/**
 * A request that never got an answer: how it is known, and what to say.
 *
 * Kept on its own, with nothing imported, because two very different
 * places need it — the error log, which must not report a phone with no
 * signal as the app being wrong (lib/clientErrors), and the sentence put
 * on screen (lib/humanError), which every page pulls in.
 */

/** A database or API error as the client hands it over: an object, not an Error. */
interface ApiError {
  message?: unknown
}

/**
 * What an error calls itself. Read off anything that has a name, not only
 * an Error: a DOMException (an aborted request) is not one in every
 * engine, and one from another frame never is.
 */
export const nameOf = (error: unknown): string => {
  if (!error || typeof error !== 'object') return ''
  const { name } = error as { name?: unknown }
  return typeof name === 'string' ? name : ''
}

export const saidBy = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as ApiError).message === 'string') return (error as ApiError).message as string
  return ''
}

/**
 * The request never got an answer: no signal, a dropped connection, a
 * deadline passed. Each browser words it its own way and none gives it a
 * type, so it is known by its words.
 */
export function isNetworkFailure(error: unknown): boolean {
  const name = nameOf(error)
  if (name === 'AbortError' || name === 'RequestTimeoutError' || name === 'TimeoutError') return true
  const said = saidBy(error)
  return (
    // The Supabase client hands a failed request on as an object whose message opens with the error's name.
    /^(AbortError|RequestTimeoutError|TimeoutError)\b/.test(said) ||
    /failed to fetch/i.test(said) || // Chromium
    /load failed/i.test(said) || // Safari
    /networkerror when attempting to fetch/i.test(said) || // Firefox
    /network request failed/i.test(said) ||
    /the internet connection appears to be offline/i.test(said) ||
    /the network connection was lost/i.test(said) ||
    /fetch failed/i.test(said) ||
    /took too long to respond/i.test(said)
  )
}

/** What the page says when a request got no answer. The same for everybody: there is nothing more to tell an Admin. */
export const NO_ANSWER = 'Could not reach the server. Check your connection and try again.'
/** The app's own deadline passed (lib/fetchTimeout). */
export const TOOK_TOO_LONG = 'The server took too long to respond. Check your connection and try again.'

/** The sentence for a request that got no answer, or null when the error is something else. */
export function noAnswerText(error: unknown): string | null {
  if (!isNetworkFailure(error)) return null
  // A request the page itself called off is not a failure to tell anybody about; it still reads sensibly if shown.
  return /took too long/i.test(saidBy(error)) || nameOf(error) === 'RequestTimeoutError' ? TOOK_TOO_LONG : NO_ANSWER
}

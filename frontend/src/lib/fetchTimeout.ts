/**
 * A network request that never comes back is worse than one that fails.
 *
 * Nothing in the Supabase client times out on its own: if a request opens a
 * connection and the far end simply stops answering — a paused project, a
 * phone that walked out of signal after the TCP handshake, a captive portal
 * swallowing traffic — the promise stays pending for ever. Every button
 * that awaits one then sits on "Saving…" with nothing to say.
 *
 * So every request gets a deadline, after which it fails like any other
 * error and the app's normal error handling reports it.
 */

/** Generous, because it also covers a 30MB handbook going up over 4G. */
export const REQUEST_TIMEOUT_MS = 60_000

export class RequestTimeoutError extends Error {
  constructor(message = 'The server took too long to respond. Check your connection and try again.') {
    super(message)
    this.name = 'RequestTimeoutError'
  }
}

/**
 * Wrap `fetch` so it gives up after `timeoutMs`.
 *
 * A caller's own AbortSignal still works: whichever fires first wins, so
 * this never takes cancellation away from code that already had it.
 */
export function fetchWithTimeout(
  baseFetch: typeof fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const callerSignal = init?.signal
    // Nothing to do but stop, and no reason to open a connection first.
    if (callerSignal?.aborted) throw callerSignal.reason

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new RequestTimeoutError()), timeoutMs)

    const onCallerAbort = () => controller.abort(callerSignal?.reason)
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true })

    // The deadline is raced against the request rather than left to the
    // signal alone: aborting only works if whatever is underneath honours
    // it, and the whole point here is that nothing can hang for ever.
    let onAbort: (() => void) | undefined
    const deadline = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason ?? new RequestTimeoutError())
      controller.signal.addEventListener('abort', onAbort, { once: true })
    })

    try {
      return await Promise.race([baseFetch(input, { ...init, signal: controller.signal }), deadline])
    } finally {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', onCallerAbort)
      if (onAbort) controller.signal.removeEventListener('abort', onAbort)
    }
  }
}

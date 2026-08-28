/**
 * Which side is broken.
 *
 * When a sign-in never comes back there are two very different causes and
 * one indistinguishable symptom. Either the app can't reach the auth
 * server at all — the project asleep, DNS gone, no signal — or it can
 * reach it perfectly well and something is stopping this particular
 * request: a network that filters POSTs, a corporate proxy, a browser
 * extension sitting between the page and the wire.
 *
 * The health endpoint tells those apart. It is a plain GET with no custom
 * headers, so it is a "simple request" in CORS terms — no preflight, no
 * apikey, nothing that a policy might treat differently from an ordinary
 * page load. If it answers while sign-in does not, the server is fine and
 * the blockage is between it and this browser.
 */
export type Reachability = 'reachable' | 'unreachable' | 'unknown'

export async function probeAuthServer(timeoutMs = 8_000): Promise<Reachability> {
  // Read here rather than through supabaseClient: this module must be
  // usable from a test that has stubbed the client away entirely.
  const url: string = import.meta.env.VITE_SUPABASE_URL ?? ''
  if (!url) return 'unknown'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      // No headers at all: adding one would make this a preflighted request
      // and stop it being the plain, comparable thing it needs to be.
      cache: 'no-store',
      signal: controller.signal,
    })
    // Any answer at all means the server is there. Even a refusal is proof
    // the packets arrive.
    return response.status > 0 ? 'reachable' : 'unreachable'
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * What to tell someone whose sign-in didn't come back, given what the
 * probe found. The distinction matters: one of these they can act on, and
 * the other means waiting.
 */
export function reachabilityAdvice(reachability: Reachability): string | null {
  if (reachability === 'reachable') {
    return 'The server is reachable, so the sign-in request itself is being stopped before it gets there — usually a browser extension, a VPN, or a network that filters traffic. Try a private window with extensions off, or a different network such as your phone’s hotspot.'
  }
  if (reachability === 'unreachable') {
    return 'The server can’t be reached from this device at all. Check your connection, then try again.'
  }
  return null
}

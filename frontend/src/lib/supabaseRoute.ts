/**
 * A second road to the same server.
 *
 * Some networks will carry a request one way and not another. The one that
 * prompted this carried every GET and every CORS preflight to Supabase and
 * silently dropped every POST — sign-in included — so the browser sat on a
 * request that had already been thrown away, and the server never knew it
 * had been asked. Nothing in the app or the database was wrong, and no
 * amount of retrying the same road would have helped.
 *
 * So the app keeps a second one. `/sb/*` on its own origin is rewritten by
 * the host straight through to the Supabase URL (see vercel.json), which
 * means a different destination address, a different TLS session and a
 * different path across the internet — and, because it is same-origin, no
 * preflight at all. When the direct road stops answering, the app moves to
 * this one and remembers, so the rest of the session doesn't have to
 * rediscover it request by request.
 *
 * It is deliberately not the default: the direct route is one hop shorter
 * and doesn't put a proxy in front of every query.
 */
const ROUTE_KEY = 'rim-supabase-route'
const PROXY_PREFIX = '/sb'

export type SupabaseRoute = 'direct' | 'proxy'

export function currentRoute(): SupabaseRoute {
  try {
    return localStorage.getItem(ROUTE_KEY) === 'proxy' ? 'proxy' : 'direct'
  } catch {
    // Storage disabled. The direct road is the right default.
    return 'direct'
  }
}

export function setRoute(route: SupabaseRoute): void {
  try {
    if (route === 'proxy') localStorage.setItem(ROUTE_KEY, 'proxy')
    else localStorage.removeItem(ROUTE_KEY)
  } catch {
    // Not being able to remember it only costs the next page load.
  }
}

/**
 * Rewrite an absolute Supabase URL to the same-origin path that the host
 * forwards. Anything that isn't a Supabase URL is returned untouched.
 */
export function viaProxy(url: string, supabaseUrl: string): string {
  if (!supabaseUrl || !url.startsWith(supabaseUrl)) return url
  return PROXY_PREFIX + url.slice(supabaseUrl.length)
}

/** The proxy path for one Supabase endpoint, for a hand-made request. */
export function proxyUrl(path: string): string {
  return `${PROXY_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Signing in when the direct road doesn't answer.
 *
 * The sign-in request is the first thing the app sends and the one that
 * matters most: without it there is no session and nothing else can be
 * tried. So when it goes unanswered, the app doesn't just report it — it
 * asks again over the same-origin route (see supabaseRoute.ts), which
 * leaves the browser by a different address and is not a cross-origin
 * request at all. If that answers, the session is real, and the route is
 * kept for the rest of the visit so every query that follows takes the
 * road that works.
 */
import { supabase } from './supabaseClient'
import { proxyUrl, setRoute } from './supabaseRoute'

export interface FallbackResult {
  ok: boolean
  /** The server's own message, when it answered and refused. */
  message?: string
}

export async function signInViaProxy(
  email: string,
  password: string,
  timeoutMs = 20_000,
): Promise<FallbackResult> {
  const anonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  if (!anonKey) return { ok: false }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(proxyUrl('/auth/v1/token?grant_type=password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    })

    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      // The server answered, so this road works — it simply said no. That
      // is a real answer and worth keeping the route for.
      const message =
        payload && typeof payload === 'object' && 'msg' in payload
          ? String((payload as { msg: unknown }).msg)
          : undefined
      if (response.status >= 400 && response.status < 500) setRoute('proxy')
      return { ok: false, message }
    }

    const tokens = payload as { access_token?: string; refresh_token?: string } | null
    if (!tokens?.access_token || !tokens.refresh_token) return { ok: false }

    // Take this road for everything from here on, then hand the tokens to
    // supabase-js so the session is stored, refreshed and observed exactly
    // as if it had signed in itself.
    setRoute('proxy')
    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    })
    if (error) {
      setRoute('direct')
      return { ok: false, message: error.message }
    }
    return { ok: true }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

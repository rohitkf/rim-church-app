import { supabase } from './supabaseClient'

/**
 * Noticing that the account behind this session no longer exists.
 *
 * Removing somebody deletes their auth user, but the access token already
 * in their browser keeps its signature and its expiry, so nothing about the
 * delete reaches it. The database refuses it — `reject_removed_user` runs
 * before every Data API request and turns them away — but the browser is
 * still holding what it thinks is a valid session, and without this it
 * would sit on a page of failed requests wondering what it had done wrong.
 *
 * So the refusal is treated as what it actually is: the end of the session.
 */

/**
 * Postgres raises `insufficient_privilege`, which PostgREST reports as
 * 42501. The message is matched too, because that code is also what an
 * ordinary RLS refusal looks like — writing to something you may only read
 * — and that must not sign anybody out.
 */
export function isAccountRemoved(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message, details } = error as {
    code?: string
    message?: string
    details?: string
  }
  if (code !== '42501' && code !== 'PGRST301') return false
  return details === 'account_removed' || /account is no longer active/i.test(message ?? '')
}

let handling = false

/**
 * Sign out, once.
 *
 * Every query in flight fails together, so this would otherwise be called a
 * dozen times in the same tick. The guard is not reset: a session that has
 * ended does not begin again, and the reload takes the page somewhere new
 * regardless.
 */
export async function handleAccountRemoved(): Promise<void> {
  if (handling) return
  handling = true
  try {
    await supabase.auth.signOut()
  } catch {
    // Signing out talks to the server, which may well refuse this token
    // too. The local session is cleared either way, which is the part
    // that matters.
  }
  if (typeof window !== 'undefined') {
    // A hard load rather than a route change, so nothing that cached a
    // profile in memory survives into the signed-out app.
    window.location.assign('/login?removed=1')
  }
}

/** Test seam. */
export function resetAccountRemovedForTests() {
  handling = false
}

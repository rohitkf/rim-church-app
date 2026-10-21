/**
 * Whether a stored image reference may be rendered as an <img src>.
 *
 * `profiles.avatar_url` is a column anybody can write on their own row and
 * every signed-in person can read. Rendered as it is, it would make a
 * Head's browser fetch whatever address a member chose to put there — a
 * beacon that tells a stranger when, and from where, the Head opened the
 * page. A picture lives in the app's own storage or is a bare object path;
 * anything else is not shown.
 */
export function trustedImageUrl(value: string | null | undefined, supabaseUrl: string | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (v === '') return null
  // A bare storage object path (no scheme, no authority) is not a URL at
  // all; today nothing resolves one, so it renders nothing rather than
  // being handed to the browser as a relative address.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v) === false) return null
  if (/^(?:https?:)?\/\//i.test(v) === false) return null
  if (!supabaseUrl) return null
  let base: URL
  let url: URL
  try {
    base = new URL(supabaseUrl)
    url = new URL(v, base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== base.protocol) return null
  if (url.host !== base.host) return null
  if (!url.pathname.startsWith('/storage/v1/object/')) return null
  return url.toString()
}

/** The same question for a profile picture, against the app's own Supabase host. */
export function trustedAvatarUrl(value: string | null | undefined): string | null {
  return trustedImageUrl(value, import.meta.env.VITE_SUPABASE_URL)
}

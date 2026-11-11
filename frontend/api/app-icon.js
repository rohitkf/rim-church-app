import { BUCKET, ICON_FILES, ICON_FOLDER, isSetName, supabaseEnv } from './_appIcon.js'

/*
 * /app-icon/<set>/<file>.png: one picture of an icon set, read out of the
 * branding bucket with the app's public key (see _appIcon.js).
 *
 * A set never changes once it is made (a new logo is a new set), so a
 * picture found is kept for good by whatever asked. A picture not found
 * sends the asker to the app's own icon of the same name instead of
 * leaving a phone with no icon at all, and that answer is not kept.
 */
export async function GET(request) {
  const url = new URL(request.url)
  const set = url.searchParams.get('set') ?? ''
  const file = url.searchParams.get('file') ?? ''
  // Only the names the app writes. Anything else is not a path into the bucket.
  if (!ICON_FILES.includes(file)) return new Response('Not found', { status: 404 })
  const fallback = () =>
    new Response(null, { status: 307, headers: { Location: `/${file}`, 'Cache-Control': 'no-store' } })
  if (!isSetName(set)) return fallback()

  const supabase = supabaseEnv()
  if (!supabase.url || !supabase.key) return fallback()
  try {
    const res = await fetch(`${supabase.url}/storage/v1/object/authenticated/${BUCKET}/${ICON_FOLDER}/${set}/${file}`, {
      headers: { apikey: supabase.key, Authorization: `Bearer ${supabase.key}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return fallback()
    return new Response(await res.arrayBuffer(), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return fallback()
  }
}

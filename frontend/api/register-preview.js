import { previewFor, previewPage } from './_linkPreview.js'

/*
 * The preview of a registration link, for link-preview robots only
 * (vercel.json routes /register/<slug> here by user agent; everybody else
 * gets the app). See _linkPreview.js.
 *
 * The event is read as anybody signed out reads it, through the public
 * registration_public_event (0244), with the same public key the app is
 * built with. If that cannot be reached the robot still gets a page — the
 * church's name and icon — never an error.
 */
export async function GET(request) {
  const url = new URL(request.url)
  const slug = (url.searchParams.get('slug') ?? '').slice(0, 200)
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

  let event = null
  if (slug && supabaseUrl && key) {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/registration_public_event`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: slug }),
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) event = await res.json()
    } catch {
      event = null
    }
  }

  const page = previewPage(previewFor(event, { supabaseUrl, origin: url.origin, slug }))
  return new Response(page, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A changed picture reaches new shares within minutes.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}

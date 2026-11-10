/*
 * What a registration link shows when it is pasted somewhere.
 *
 * WhatsApp, iMessage, Facebook and the rest build their preview from the
 * page's HTML without running any of it, and the app is one empty shell for
 * every address — so a pasted /register/<slug> had no title and no picture.
 * register-preview.js answers those robots (and only them: vercel.json
 * sends a request there by its user agent) with a page that carries the
 * event's title, a line about it and its picture. A person opening the
 * link never sees it; they get the app.
 *
 * Plain JavaScript, with no build step: Vercel runs it as it is, and the
 * tests import it as it is.
 */

/** Shown when an event has no picture of its own. */
export const FALLBACK_IMAGE = '/icon-512.png'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** @param {string} text */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/**
 * The first part of the event's description, on one line, cut at a word.
 * @param {string | null | undefined} text
 * @param {number} [max]
 */
export function summary(text, max = 180) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '')}…`
}

/**
 * The public address of a picture in the registration-images bucket, which
 * is public (0244).
 * @param {string} supabaseUrl
 * @param {string} path
 */
export function imageUrl(supabaseUrl, path) {
  const base = supabaseUrl.replace(/\/+$/, '')
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/registration-images/${encoded}`
}

/**
 * What the preview says, from what registration_public_event returns.
 * @param {{ title?: string, description?: string | null, image_path?: string | null, cancelled_at?: string | null } | null} event
 * @param {{ supabaseUrl: string, origin: string, slug: string, siteName?: string }} where
 */
export function previewFor(event, { supabaseUrl, origin, slug, siteName = 'Rehoboth International Ministries' }) {
  const url = `${origin}/register/${encodeURIComponent(slug)}`
  if (!event || !event.title) {
    return { title: siteName, description: 'Registration', image: `${origin}${FALLBACK_IMAGE}`, url, siteName, large: false }
  }
  const title = event.cancelled_at ? `Cancelled: ${event.title}` : event.title
  const description = summary(event.description) || `Register for ${event.title}.`
  const hasImage = !!event.image_path
  return {
    title,
    description,
    image: hasImage ? imageUrl(supabaseUrl, event.image_path) : `${origin}${FALLBACK_IMAGE}`,
    url,
    siteName,
    // A picture of its own gets the big card; the app's icon a small one.
    large: hasImage,
  }
}

/**
 * The whole page a link-preview robot is given: the tags it reads, and a
 * link through for anybody who lands on it some other way.
 * @param {ReturnType<typeof previewFor>} p
 */
export function previewPage(p) {
  const t = escapeHtml(p.title)
  const d = escapeHtml(p.description)
  const img = escapeHtml(p.image)
  const url = escapeHtml(p.url)
  const site = escapeHtml(p.siteName)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${site}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${t}">
<meta name="twitter:card" content="${p.large ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${url}">Open the registration</a></p>
</body>
</html>
`
}

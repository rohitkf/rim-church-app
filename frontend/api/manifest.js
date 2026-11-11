import { currentSet, manifestWith, supabaseEnv } from './_appIcon.js'
import { BASE_MANIFEST } from './_manifestBase.js'

/*
 * /manifest.webmanifest, answered by a function so that the installed
 * app's icon is whatever the App Logo is (see _appIcon.js). vercel.json
 * sends the address here; the build takes the static file out of Vercel's
 * output so that it does (a file that exists is served before a rewrite
 * is looked at).
 */
export async function GET() {
  const manifest = manifestWith(BASE_MANIFEST, await currentSet(supabaseEnv()))
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // A changed logo reaches a new install within minutes.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}

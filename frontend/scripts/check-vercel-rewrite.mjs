/*
 * A fork must not deploy with somebody else's database in its fallback road.
 *
 * vercel.json rewrites /sb/* to a Supabase host (lib/supabaseRoute.ts), and
 * a rewrite cannot read an environment variable, so the host is written in
 * the file. A fork that deploys it unchanged would send its volunteers'
 * sign-ins to the original church's database on the day their network
 * trips the fallback. SETUP.md step 10 says so; this makes it impossible to
 * miss.
 *
 * Runs before every build, and does nothing anywhere but a Vercel build
 * (VERCEL=1): CI and Docker build against placeholders. On Vercel it fails
 * when the rewrite's host is not the host in VITE_SUPABASE_URL. The repo it
 * was written for only gets a warning, so a mistyped variable there can
 * never stop a release.
 */
import { readFileSync } from 'node:fs'

const ORIGINAL_OWNER = 'rohitkf'

if (process.env.VERCEL) {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const rewrite = (config.rewrites ?? []).find((r) => r.source === '/sb/:path*')
  const hostOf = (url) => {
    try {
      return new URL(url).host
    } catch {
      return null
    }
  }
  const proxied = rewrite && hostOf(rewrite.destination.replace('/:path*', ''))
  const configured = hostOf(process.env.VITE_SUPABASE_URL ?? '')

  if (proxied && configured && proxied !== configured) {
    const message =
      `vercel.json sends /sb/* to ${proxied}, but VITE_SUPABASE_URL is ${configured}.\n` +
      `Change the /sb rewrite in frontend/vercel.json to https://${configured}/:path* (SETUP.md, step 10).`
    if (process.env.VERCEL_GIT_REPO_OWNER === ORIGINAL_OWNER) {
      console.warn(`Warning: ${message}`)
    } else {
      console.error(`\n${message}\n`)
      process.exit(1)
    }
  }
}

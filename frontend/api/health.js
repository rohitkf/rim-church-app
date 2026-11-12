import { supabaseEnv } from './_appIcon.js'
import { askDatabase, buildOf, healthAnswer } from './_health.js'

/*
 * /api/health: is the site up, and is the database answering? (See
 * _health.js.) Asked afresh every time — an answer from a cache is the
 * one thing a health check must never be given.
 */
export async function GET() {
  const { status, body } = healthAnswer(await askDatabase(supabaseEnv()), buildOf())
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

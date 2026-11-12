import { supabaseEnv } from './_appIcon.js'
import { readLedger } from './_health.js'

/*
 * /api/ledger: which migrations the database says it has (0285), as JSON.
 * Read by the weekly check that production and the repository agree
 * (.github/workflows/database-drift.yml). 503 when the database could not
 * be asked, so the check can tell "differs" from "could not look".
 */
export async function GET() {
  const rows = await readLedger(supabaseEnv())
  return new Response(JSON.stringify(rows ?? { error: 'The ledger could not be read.' }), {
    status: rows ? 200 : 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

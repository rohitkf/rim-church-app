import { supabase } from './supabaseClient'
import { SCHEMA_NEEDS } from './schemaNeeds'

/**
 * Whether the database has caught up with this build (0285).
 *
 * A release goes out in two halves — the database's, by hand, and the
 * app's, by itself — and for the minutes they are out of step every page
 * that uses what is new fails in the database's own words. This asks the
 * database which migration it has reached (`health()` carries
 * `schema_version()`) and compares it with the one this build needs
 * (lib/schemaNeeds); components/DatabaseGate puts a page that says "being
 * updated" in place of the app while it is behind, and takes it away by
 * itself when it is not.
 *
 * Not being able to ask is never "behind". A database that does not
 * answer, an answer with no number in it (a database from before 0285), a
 * number that is not one: each opens the app, exactly as it would have
 * opened before any of this existed. Only a clear, lower number closes
 * it — the same rule as a closed app and a blocked account (lib/standing).
 */

export const DATABASE_VERSION_KEY = ['database-version']

/** While the app waits for the database, it asks again this often. */
export const BEHIND_ASKS_EVERY_MS = 15_000
/** An answer that says "caught up" is believed for this long before it is asked for again. */
export const VERSION_FRESH_MS = 5 * 60_000
/** How long somebody waits on the page before it offers to open the app as it is. */
export const OPEN_ANYWAY_AFTER_MS = 45_000

/** The migration the database has reached, or null when it could not say. Never throws. */
export async function fetchDatabaseVersion(): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('health')
    if (error || !data || typeof data !== 'object') return null
    const { schema } = data as { schema?: unknown }
    return typeof schema === 'number' && Number.isInteger(schema) && schema >= 0 ? schema : null
  } catch {
    return null
  }
}

/** Behind only when the database has clearly said a lower number than this build needs. */
export function databaseIsBehind(version: number | null | undefined, needs: number = SCHEMA_NEEDS): boolean {
  return typeof version === 'number' && Number.isInteger(version) && version < needs
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { databaseIsBehind, fetchDatabaseVersion } from './databaseVersion'
import { SCHEMA_NEEDS } from './schemaNeeds'

/*
 * Whether the database has caught up with this build (0285). The rule
 * that matters most: only a clear, lower number is "behind". Everything
 * else — no answer, an old database, nonsense — leaves the app open.
 */

const rpc = vi.hoisted(() => vi.fn<(name: string) => Promise<{ data: unknown; error: unknown }>>())
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (name: string) => rpc(name) } }))

beforeEach(() => {
  rpc.mockReset()
})

describe('asking the database which migration it has reached', () => {
  it('asks health(), the question a visitor may ask too', async () => {
    rpc.mockResolvedValue({ data: { ok: true, at: '2026-11-12T09:00:00Z', schema: 285 }, error: null })
    await expect(fetchDatabaseVersion()).resolves.toBe(285)
    expect(rpc).toHaveBeenCalledWith('health')
  })

  it('does not know, for a database from before it could say', async () => {
    rpc.mockResolvedValue({ data: { ok: true, at: '2026-11-12T09:00:00Z' }, error: null })
    await expect(fetchDatabaseVersion()).resolves.toBeNull()
  })

  it('does not know, when the database refuses or cannot be reached', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.health' } })
    await expect(fetchDatabaseVersion()).resolves.toBeNull()
    rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchDatabaseVersion()).resolves.toBeNull()
  })

  it('does not know, for an answer that is not a whole number', async () => {
    for (const schema of ['285', 285.5, -1, null, {}, Number.NaN]) {
      rpc.mockResolvedValue({ data: { ok: true, schema }, error: null })
      await expect(fetchDatabaseVersion(), String(schema)).resolves.toBeNull()
    }
    for (const data of [null, 'ok', 42, []]) {
      rpc.mockResolvedValue({ data, error: null })
      await expect(fetchDatabaseVersion(), String(data)).resolves.toBeNull()
    }
  })

  it('takes nought as an answer: an empty ledger is a database far behind, not an unknown one', async () => {
    rpc.mockResolvedValue({ data: { ok: true, schema: 0 }, error: null })
    await expect(fetchDatabaseVersion()).resolves.toBe(0)
  })
})

describe('whether the database is behind this build', () => {
  it('is, when it has clearly said a lower number', () => {
    expect(databaseIsBehind(SCHEMA_NEEDS - 1)).toBe(true)
    expect(databaseIsBehind(0)).toBe(true)
    expect(databaseIsBehind(284, 285)).toBe(true)
  })

  it('is not, when it has reached the number, or passed it', () => {
    expect(databaseIsBehind(SCHEMA_NEEDS)).toBe(false)
    // The database is always applied first, so ahead is the ordinary state between releases.
    expect(databaseIsBehind(SCHEMA_NEEDS + 3)).toBe(false)
  })

  it('never is, when it could not be asked or did not say', () => {
    expect(databaseIsBehind(null)).toBe(false)
    expect(databaseIsBehind(undefined)).toBe(false)
    expect(databaseIsBehind(Number.NaN)).toBe(false)
    expect(databaseIsBehind(284.5, 285)).toBe(false)
  })
})

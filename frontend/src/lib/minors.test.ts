import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }))
vi.mock('./usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }))

import { fetchMinors, MINORS_KEY } from './minors'
import { LIVE_TABLES } from './liveTables'

beforeEach(() => rpc.mockReset())

describe('who is under 18', () => {
  it('asks the database, and reads ids back as a set', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const minors = await fetchMinors()
    expect(rpc).toHaveBeenCalledWith('people_under_18')
    expect([...minors].sort()).toEqual(['a', 'b'])
    expect(minors.has('a')).toBe(true)
    expect(minors.has('c')).toBe(false)
  })

  it('reads no answer as nobody', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await fetchMinors()).size).toBe(0)
  })

  it('passes a refusal on', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(fetchMinors()).rejects.toMatchObject({ code: '42501' })
  })

  it('is read again when somebody’s profile changes: a date of birth decides it', () => {
    const profiles = LIVE_TABLES.find((t) => t.table === 'profiles')!
    expect(profiles.keys).toContain(MINORS_KEY[0])
  })
})

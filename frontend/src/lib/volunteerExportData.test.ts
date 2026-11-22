import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * What the volunteer export reads when Export is pressed: each part for
 * whoever has the right to it, and a part that cannot be read named and
 * left out rather than costing the whole file.
 */
const db = vi.hoisted(() => ({
  rpc: {} as Record<string, { data?: unknown; error?: unknown }>,
  tables: {} as Record<string, { data?: unknown; error?: unknown }>,
  asked: [] as string[],
}))
vi.mock('./supabaseClient', () => {
  const chain = (table: string) => {
    const result = () => Promise.resolve({ data: db.tables[table]?.data ?? [], error: db.tables[table]?.error ?? null })
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === 'then') return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
          return () => proxy
        },
      },
    )
    return proxy
  }
  return {
    supabase: {
      rpc: (name: string) => {
        db.asked.push(`rpc:${name}`)
        return Promise.resolve({ data: db.rpc[name]?.data ?? [], error: db.rpc[name]?.error ?? null })
      },
      from: (table: string) => {
        db.asked.push(table)
        return chain(table)
      },
    },
  }
})

import { fetchExportExtras } from './volunteerExportData'

const everything = { contacts: true, setup: true, blocks: true, minors: true }

beforeEach(() => {
  db.asked = []
  db.rpc = {
    people_details: { data: [{ id: 'u1', marital_status: 'married', joined_at: '2026-01-05T09:00:00Z', email_confirmed_at: null, last_sign_in_at: null }] },
    people_setup: { data: [{ user_id: 'u1', joined: true, gaps: ['dob'], notifications: null, completed_at: null }] },
    people_under_18: { data: [{ id: 'u2' }] },
  }
  db.tables = {
    account_blocks: { data: [{ user_id: 'u2', reason: 'Asked to step back', blocked_by: 'u1', blocked_at: '2026-09-01T12:00:00Z' }] },
    rota_assignments: {
      data: [
        { user_id: 'u1', department_id: 'd1', role_label: 'Camera', is_shadow: false, service: { date: '2026-10-04', service_type: 'English Service' } },
        // A service that has gone: nothing to say when.
        { user_id: 'u1', department_id: 'd1', role_label: 'Camera', is_shadow: false, service: null },
      ],
    },
    guests: { data: [{ id: 'g1', name: 'Saju Wigan', title: 'Ps', note: null, became_member: null }] },
    department_guests: { data: [{ guest_id: 'g1', department_id: 'd1', member_type: 'guest' }] },
  }
})

describe('what the volunteer export reads', () => {
  it('reads every part for somebody with every right', async () => {
    const extras = await fetchExportExtras(everything)
    expect(extras.leftOut).toEqual([])
    expect(extras.details?.get('u1')).toMatchObject({ marital_status: 'married', last_sign_in_at: null })
    expect(extras.setup?.get('u1')).toEqual({ joined: true, gaps: ['dob'], notifications: false, completed_at: null })
    expect(extras.blocks?.get('u2')).toEqual({ blocked_at: '2026-09-01T12:00:00Z', reason: 'Asked to step back' })
    expect(extras.minors?.has('u2')).toBe(true)
    expect(extras.serving).toEqual([{ user_id: 'u1', department_id: 'd1', role_label: 'Camera', is_shadow: false, date: '2026-10-04', service_type: 'English Service' }])
    expect(extras.guests).toEqual([{ id: 'g1', name: 'Saju Wigan', title: 'Ps', note: null, became_member: false, teams: [{ department_id: 'd1', member_type: 'guest' }] }])
  })

  it('does not ask for what the reader has no right to', async () => {
    const extras = await fetchExportExtras({ contacts: false, setup: false, blocks: false, minors: false })
    expect(db.asked).not.toContain('rpc:people_details')
    expect(db.asked).not.toContain('rpc:people_setup')
    expect(db.asked).not.toContain('rpc:people_under_18')
    expect(db.asked).not.toContain('account_blocks')
    expect(extras.details).toBeUndefined()
    expect(extras.setup).toBeUndefined()
    expect(extras.blocks).toBeUndefined()
    expect(extras.minors).toBeUndefined()
    // The rota and the guest roll are everybody's who has the page.
    expect(extras.serving).toHaveLength(1)
    expect(extras.guests).toHaveLength(1)
    expect(extras.leftOut).toEqual([])
  })

  it('names a part that could not be read, and still hands back the rest', async () => {
    db.rpc.people_details = { error: { code: '42883', message: 'function does not exist' } }
    db.tables.rota_assignments = { error: { code: '42501', message: 'permission denied' } }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const extras = await fetchExportExtras(everything)
    quiet.mockRestore()
    expect(extras.leftOut).toEqual(['marital status and sign-in dates', 'the rota'])
    expect(extras.details).toBeUndefined()
    expect(extras.serving).toBeUndefined()
    expect(extras.setup?.size).toBe(1)
    expect(extras.guests).toHaveLength(1)
  })
})

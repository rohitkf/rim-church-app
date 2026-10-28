import { describe, expect, it } from 'vitest'
import { applyGrantChanges, touchedBy } from './grantPreview'
import type { PermissionGrant } from './permissions'

const W = 'worship'
const given: PermissionGrant[] = [
  { capability: 'clockin.approve', userId: null, departmentId: W, reach: 'all', leadsOnly: true },
  { capability: 'set.edit', userId: 'asha', departmentId: null, reach: 'team', leadsOnly: false },
]

describe('a grant not yet sent', () => {
  it('adds one for a person, and for a team with its Heads-only flag', () => {
    const out = applyGrantChanges(given, [
      { capability: 'rota.assign', person: 'ben', reach: 'team' },
      { capability: 'rota.assign', team: W, reach: 'all', leads_only: true },
    ])
    expect(out).toHaveLength(4)
    expect(out[2]).toEqual({ capability: 'rota.assign', userId: 'ben', departmentId: null, reach: 'team', leadsOnly: false, expiresAt: null })
    expect(out[3]).toEqual({ capability: 'rota.assign', userId: null, departmentId: W, reach: 'all', leadsOnly: true, expiresAt: null })
  })

  it('replaces one said again, and drops one taken back', () => {
    const out = applyGrantChanges(given, [
      { capability: 'clockin.approve', team: W, reach: 'team', leads_only: false },
      { capability: 'set.edit', person: 'asha', reach: null },
    ])
    expect(out).toEqual([{ capability: 'clockin.approve', userId: null, departmentId: W, reach: 'team', leadsOnly: false, expiresAt: null }])
  })

  it('keeps an end date given with it (0218)', () => {
    const [out] = applyGrantChanges([], [{ capability: 'rota.assign', person: 'ben', reach: 'team', until: '2026-11-13T00:00:00.000Z' }])
    expect(out.expiresAt).toBe('2026-11-13T00:00:00.000Z')
  })

  it('leaves the grants as stored alone', () => {
    applyGrantChanges(given, [{ capability: 'set.edit', person: 'asha', reach: null }])
    expect(given).toHaveLength(2)
  })

  it('names each action touched once, and only actions the grid knows', () => {
    expect(
      touchedBy([
        { capability: 'rota.assign', person: 'ben', reach: 'team' },
        { capability: 'rota.assign', team: W, reach: null },
        { capability: 'not.a.thing', person: 'ben', reach: 'all' },
      ]),
    ).toEqual(['rota.assign'])
  })
})

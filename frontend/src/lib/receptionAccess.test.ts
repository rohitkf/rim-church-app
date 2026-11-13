import { describe, expect, it } from 'vitest'
import { NEW_DOOR_HOLDER, RECEPTION_KEYS, receptionFromGrants, receptionGrantChanges, toggleDoorButton, withDoorHolder } from './receptionAccess'
import { LOCKABLE_RIGHTS } from './registrationRights'
import type { PermissionGrant } from './permissions'

const grant = (over: Partial<PermissionGrant>): PermissionGrant =>
  ({ capability: 'reg.door', userId: null, departmentId: null, reach: 'all', ...over }) as PermissionGrant

describe('who works Reception, as holders and ticks', () => {
  it('offers exactly the door\'s own rights — the ones a lock switches off', () => {
    expect([...RECEPTION_KEYS].sort()).toEqual([...LOCKABLE_RIGHTS].sort())
  })

  it('reads the church\'s grants as a team\'s and a person\'s buttons, and nothing that is not the door\'s', () => {
    const access = receptionFromGrants([
      grant({ capability: 'reg.walk_in', userId: 'grace' }),
      grant({ capability: 'reg.door', userId: 'grace' }),
      grant({ capability: 'reg.door_pay', departmentId: 'ushers' }),
      grant({ capability: 'reg.manage', userId: 'grace' }),
      grant({ capability: 'stage.add', departmentId: 'ushers' }),
    ])
    expect(access).toEqual({ teams: { ushers: ['reg.door_pay'] }, people: { grace: ['reg.door', 'reg.walk_in'] } })
  })

  it('saves only what changed: a tick added is given, a tick removed is taken back', () => {
    const stored = { teams: { ushers: ['reg.door' as const] }, people: { grace: ['reg.door' as const, 'reg.door_pay' as const] } }
    let next = toggleDoorButton(stored, 'people', 'grace', 'reg.door_pay')
    next = toggleDoorButton(next, 'teams', 'ushers', 'reg.walk_in')
    next = withDoorHolder(next, 'people', 'sam', NEW_DOOR_HOLDER)
    expect(receptionGrantChanges(stored, next)).toEqual([
      { capability: 'reg.walk_in', team: 'ushers', reach: 'all' },
      { capability: 'reg.door_pay', person: 'grace', reach: null },
      { capability: 'reg.door', person: 'sam', reach: 'all' },
    ])
    expect(receptionGrantChanges(stored, stored)).toEqual([])
  })

  it('takes every button back when somebody is removed', () => {
    const stored = { teams: {}, people: { grace: ['reg.door' as const, 'reg.walk_in' as const] } }
    expect(receptionGrantChanges(stored, withDoorHolder(stored, 'people', 'grace', null))).toEqual([
      { capability: 'reg.door', person: 'grace', reach: null },
      { capability: 'reg.walk_in', person: 'grace', reach: null },
    ])
  })
})

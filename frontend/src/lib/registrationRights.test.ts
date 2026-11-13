import { describe, expect, it } from 'vitest'
import { DOOR_RIGHTS, LOCKABLE_RIGHTS, OFFICE_RIGHTS, rightsFrom } from './registrationRights'
import type { CapabilityKey } from './permissions'
import migration from '../../../supabase/migrations/0288_reception_can_be_locked.sql?raw'

/*
 * What a person may press on the registration pages, as the pages work it
 * out — the same rule the database's registration_can() holds them to.
 */

const holding = (...caps: CapabilityKey[]) => rightsFrom((cap) => caps.includes(cap), false)

describe('correcting an email address (0283)', () => {
  it('is its own right, and "Run registrations" includes it', () => {
    expect(holding('reg.email').email).toBe(true)
    expect(holding('reg.manage').email).toBe(true)
    expect(holding('reg.view').email).toBe(false)
    expect(holding('reg.approve', 'reg.refund', 'reg.cancel', 'reg.edit', 'reg.verify', 'reg.door').email).toBe(false)
    expect(holding().email).toBe(false)
  })

  it('opens the Registrations page, and gives nothing else on it', () => {
    const only = holding('reg.email')
    expect(only.office).toBe(true)
    expect(only).toMatchObject({ door: false, edit: false, approve: false, takePayment: false, refund: false, cancel: false, delete: false, checkIn: false, walkIn: false, verify: false })
  })

  it('is one of the rights the database opens the page for, too', () => {
    const office = /when 'office' then([\s\S]*?)when 'door'/.exec(migration)?.[1] ?? ''
    const inSql = [...office.matchAll(/'(reg\.[a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...OFFICE_RIGHTS].sort())
    const email = /when 'email' then([^\n]*)/.exec(migration)?.[1] ?? ''
    expect([...email.matchAll(/'(reg\.[a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(['reg.email', 'reg.manage'])
  })
})

describe('a locked Reception (0288)', () => {
  const locked = (...caps: CapabilityKey[]) => rightsFrom((cap) => caps.includes(cap), false, true)

  it('switches the door\'s own rights off, every one', () => {
    for (const cap of LOCKABLE_RIGHTS) {
      expect(holding(cap).door).toBe(true)
      expect(locked(cap)).toMatchObject({ door: false, checkIn: false, walkIn: false, takePayment: false })
    }
    expect(locked('reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_view').door).toBe(false)
  })

  it('does not hold whoever runs registrations, nor the office', () => {
    expect(locked('reg.manage')).toMatchObject({ door: true, checkIn: true, walkIn: true, takePayment: true })
    // Approving a payment is the office's; it is not a door right.
    expect(locked('reg.approve')).toMatchObject({ office: true, approve: true, takePayment: true })
    expect(locked('reg.view').office).toBe(true)
  })

  it('gives everything back when it is unlocked: nobody\'s rights were changed', () => {
    expect(rightsFrom((cap) => cap === 'reg.walk_in', false, false)).toMatchObject({ door: true, checkIn: true, walkIn: true })
  })

  it('is the same list of rights the database switches off', () => {
    // Every right named inside a "not reception_is_locked() and (…)" in registration_can.
    const guarded = [...migration.matchAll(/not public\.reception_is_locked\(\)\s+and ([\s\S]*?)\n\s+when /g)].flatMap((m) =>
      [...m[1].matchAll(/'(reg\.[a-z_]+)'/g)].map((x) => x[1]),
    )
    expect([...new Set(guarded)].sort()).toEqual([...LOCKABLE_RIGHTS].sort())
    expect([...LOCKABLE_RIGHTS, 'reg.manage'].sort()).toEqual([...DOOR_RIGHTS].sort())
    // And "Run registrations" is never inside one.
    expect(guarded).not.toContain('reg.manage')
  })
})

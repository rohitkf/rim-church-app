import { describe, expect, it } from 'vitest'
import { DOOR_RIGHTS, LOCKABLE_RIGHTS, OFFICE_RIGHTS, rightsFrom } from './registrationRights'
import type { CapabilityKey } from './permissions'
import migration from '../../../supabase/migrations/0312_reception_sorts_out_its_own_problems.sql?raw'

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

  it('gives the door\'s fifth right five of the office\'s answers and no others (0312)', () => {
    const fixer = rightsFrom((cap) => cap === 'reg.door_fix', false, false)
    // It opens Reception, and answers for an email, a note, a promo code, a waiver and one registration's cancelling.
    expect(fixer).toMatchObject({ door: true, fix: true, email: true, note: true, promo: true, waive: true, cancelOrder: true })
    // It is not the office, and none of the office's own: not approving, refunding, verifying, editing or cancelling an event.
    expect(fixer).toMatchObject({ office: false, approve: false, refund: false, verify: false, edit: false, cancel: false, delete: false })
    // Nor is it the door's other three: somebody may sort out problems without holding the cash box.
    expect(fixer).toMatchObject({ checkIn: false, takePayment: false, walkIn: false })
    // Locked, it gives nothing — it is a door right.
    expect(rightsFrom((cap) => cap === 'reg.door_fix', false, true)).toMatchObject({ door: false, fix: false, email: false, note: false, promo: false, waive: false, cancelOrder: false })
    // The office's rights answer the same questions they always did, locked or not.
    expect(rightsFrom((cap) => cap === 'reg.approve', false, true)).toMatchObject({ waive: true, promo: true, cancelOrder: false, note: true, fix: false })
    expect(rightsFrom((cap) => cap === 'reg.cancel', false, true)).toMatchObject({ cancelOrder: true, cancel: true, waive: false, note: true })
    expect(rightsFrom((cap) => cap === 'reg.view', false, false)).toMatchObject({ note: true, email: false, waive: false, promo: false, cancelOrder: false })
    // Somebody who only checks people in has none of it, and no note to write.
    expect(rightsFrom((cap) => cap === 'reg.door', false, false)).toMatchObject({ checkIn: true, fix: false, email: false, note: false, promo: false, waive: false, cancelOrder: false })
    // "Run registrations" is all of it, locked or not.
    expect(rightsFrom((cap) => cap === 'reg.manage', false, true)).toMatchObject({ fix: true, email: true, note: true, promo: true, waive: true, cancelOrder: true })
  })

  it('gives everything back when it is unlocked: nobody\'s rights were changed', () => {
    expect(rightsFrom((cap) => cap === 'reg.walk_in', false, false)).toMatchObject({ door: true, checkIn: true, walkIn: true })
  })

  it('is the same list of rights the database switches off', () => {
    // Every right named inside a "not reception_is_locked() and (…)" in registration_can, as 0312 left it.
    const guarded = [...migration.matchAll(/not public\.reception_is_locked\(\)\s+and ([\s\S]*?)\n\s+(?:when|else|--) /g)].flatMap((m) =>
      [...m[1].matchAll(/'(reg\.[a-z_]+)'/g)].map((x) => x[1]),
    )
    expect([...new Set(guarded)].sort()).toEqual([...LOCKABLE_RIGHTS].sort())
    expect([...LOCKABLE_RIGHTS, 'reg.manage'].sort()).toEqual([...DOOR_RIGHTS].sort())
    // And "Run registrations" is never inside one.
    expect(guarded).not.toContain('reg.manage')
  })
})

import { describe, expect, it } from 'vitest'
import { OFFICE_RIGHTS, rightsFrom } from './registrationRights'
import type { CapabilityKey } from './permissions'
import migration from '../../../supabase/migrations/0283_an_email_that_bounced_says_so.sql?raw'

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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }))

import {
  PRIVACY_LIMITS,
  fetchPrivacyDetails,
  hasPrivacyDetails,
  privacyDetailsFault,
  samePrivacyDetails,
  savePrivacyDetails,
  tidyPrivacyDetails,
} from './privacyDetails'
import migration from '../../../supabase/migrations/0334_a_second_step_and_your_own_data.sql?raw'

/*
 * What the church says about itself on /privacy (0334): who to ask, where
 * to write, and anything in its own words.
 */
beforeEach(() => rpc.mockReset())

describe('what is kept of what was typed', () => {
  it('trims each piece and leaves the blanks out', () => {
    expect(tidyPrivacyDetails({ contact_name: '  The office ', contact_email: '', note: '   ' })).toEqual({ contact_name: 'The office' })
    expect(hasPrivacyDetails({ contact_email: ' ' })).toBe(false)
    expect(hasPrivacyDetails({ postal_address: '1 High St' })).toBe(true)
    expect(hasPrivacyDetails(null)).toBe(false)
  })

  it('says what is wrong before the database has to', () => {
    expect(privacyDetailsFault({ contact_email: 'office@church.test' })).toBeNull()
    expect(privacyDetailsFault({ contact_email: 'not an address' })).toMatch(/email address/)
    expect(privacyDetailsFault({ contact_name: 'x'.repeat(PRIVACY_LIMITS.contact_name + 1) })).toMatch(/120 characters/)
    expect(privacyDetailsFault({})).toBeNull()
  })

  it('knows a draft that changes nothing', () => {
    expect(samePrivacyDetails({ contact_name: 'A ' }, { contact_name: 'A', note: '' })).toBe(true)
    expect(samePrivacyDetails({ contact_name: 'A' }, { contact_name: 'B' })).toBe(false)
  })

  it('allows what the database allows, piece for piece', () => {
    for (const [key, most] of Object.entries(PRIVACY_LIMITS)) expect(migration).toContain(`"${key}": ${most}`)
  })
})

describe('reading and saving', () => {
  it('reads through the one function open to anybody, and shows nothing it cannot read', async () => {
    rpc.mockResolvedValueOnce({ data: { contact_name: 'The office', extra: 1 }, error: null })
    expect(await fetchPrivacyDetails()).toEqual({ contact_name: 'The office' })
    expect(rpc).toHaveBeenCalledWith('privacy_details')
    rpc.mockResolvedValueOnce({ data: { contact_name: 7 }, error: null })
    expect(await fetchPrivacyDetails()).toEqual({})
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await fetchPrivacyDetails()).toEqual({})
  })

  it('saves through the function that checks who is asking, and keeps what it says was kept', async () => {
    rpc.mockResolvedValueOnce({ data: { contact_name: 'The office' }, error: null })
    expect(await savePrivacyDetails({ contact_name: 'The office' })).toEqual({ contact_name: 'The office' })
    expect(rpc).toHaveBeenCalledWith('set_privacy_details', { p_details: { contact_name: 'The office' } })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Changing that setting is not open to you.' } })
    await expect(savePrivacyDetails({})).rejects.toMatchObject({ code: '42501' })
  })

  it('is readable by a visitor and writable only by whoever holds General', () => {
    expect(migration).toContain('grant execute on function public.privacy_details() to anon, authenticated;')
    expect(migration).toContain('revoke all on function public.set_privacy_details(jsonb) from public, anon;')
    expect(migration).toContain("if not public.may(auth.uid(), 'settings.general') then")
    // A direct write to the column is the same room's (the guard on app_settings reads this).
    expect(migration).toMatch(/'notification_retention_days', 'privacy_details'\) then array\['settings\.general'\]/)
  })
})

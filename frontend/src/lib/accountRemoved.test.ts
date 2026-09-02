import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isAccountRemoved, handleAccountRemoved, resetAccountRemovedForTests } from './accountRemoved'

const signOut = vi.fn()

vi.mock('./supabaseClient', () => ({
  supabase: { auth: { signOut: () => signOut() } },
}))

describe('isAccountRemoved', () => {
  it('recognises the pre-request refusal by its detail', () => {
    expect(
      isAccountRemoved({ code: '42501', message: 'permission denied', details: 'account_removed' }),
    ).toBe(true)
  })

  it('recognises it by message too, since PostgREST does not always carry the detail', () => {
    expect(isAccountRemoved({ code: '42501', message: 'Your account is no longer active.' })).toBe(
      true,
    )
  })

  it('leaves an ordinary RLS refusal alone', () => {
    // The case that matters most. 42501 is also what you get for writing to
    // a row you may only read — signing somebody out for that would be a
    // far worse bug than the one this exists to fix.
    expect(
      isAccountRemoved({
        code: '42501',
        message: 'new row violates row-level security policy for table "services"',
      }),
    ).toBe(false)
  })

  it('ignores everything that is not a permission error', () => {
    expect(isAccountRemoved({ code: 'PGRST116', message: 'Your account is no longer active.' })).toBe(
      false,
    )
    expect(isAccountRemoved(new Error('network'))).toBe(false)
    expect(isAccountRemoved(null)).toBe(false)
    expect(isAccountRemoved('nope')).toBe(false)
  })
})

describe('handleAccountRemoved', () => {
  beforeEach(() => {
    resetAccountRemovedForTests()
    signOut.mockReset().mockResolvedValue({ error: null })
    vi.stubGlobal('window', { location: { assign: vi.fn() } })
  })

  it('signs out and sends them to the sign-in page', async () => {
    await handleAccountRemoved()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(window.location.assign).toHaveBeenCalledWith('/login?removed=1')
  })

  it('does it once, however many queries fail together', async () => {
    // A page with a dozen queries fails a dozen times in the same tick.
    await Promise.all([handleAccountRemoved(), handleAccountRemoved(), handleAccountRemoved()])
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('still leaves, even when signing out is itself refused', async () => {
    // Signing out is a request too, and the server may well turn this token
    // away. The local session is gone regardless; staying put would be the
    // one unacceptable outcome.
    signOut.mockRejectedValue(new Error('refused'))
    await handleAccountRemoved()
    expect(window.location.assign).toHaveBeenCalledWith('/login?removed=1')
  })
})

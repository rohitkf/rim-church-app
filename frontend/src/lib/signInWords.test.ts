import { describe, expect, it } from 'vitest'
import { alreadyHasAccount, isWrongPassword } from './signInWords'
import { SIGN_OUT_SCOPE } from './signOutScope'

describe('what the sign-in service said', () => {
  it('knows a wrong email or password, however it is cased', () => {
    expect(isWrongPassword('Invalid login credentials')).toBe(true)
    expect(isWrongPassword('invalid login credentials.')).toBe(true)
    expect(isWrongPassword('Email not confirmed')).toBe(false)
    expect(isWrongPassword(null)).toBe(false)
  })

  it('knows a sign-up for an address that already has an account: a person with no identities', () => {
    expect(alreadyHasAccount({ identities: [] })).toBe(true)
    expect(alreadyHasAccount({ identities: [{ provider: 'email' }] })).toBe(false)
    // Nothing to go by is not a yes.
    expect(alreadyHasAccount({})).toBe(false)
    expect(alreadyHasAccount(null)).toBe(false)
  })

  it('signs out this device only', () => {
    expect(SIGN_OUT_SCOPE).toBe('local')
  })
})

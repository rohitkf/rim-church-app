import { beforeEach, describe, expect, it, vi } from 'vitest'

const mfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
}))
const getSession = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({ supabase: { auth: { mfa, getSession }, rpc } }))

import migration from '../../../supabase/migrations/0334_a_second_step_and_your_own_data.sql?raw'

/*
 * A second step at sign-in (0334). The database refuses a half signed-in
 * account everything; this is the app's side of asking for the code.
 */
async function fresh() {
  vi.resetModules()
  return import('./secondStep')
}

beforeEach(() => {
  for (const fn of Object.values(mfa)) fn.mockReset()
  getSession.mockReset()
  rpc.mockReset()
})

describe('telling the refusal apart', () => {
  it('knows the database asking for the code from every other refusal', async () => {
    const { isSecondStepNeeded } = await fresh()
    expect(isSecondStepNeeded({ code: '42501', details: 'second_step_needed', message: 'x' })).toBe(true)
    expect(isSecondStepNeeded({ code: '42501', message: 'Enter the code from your authenticator app to finish signing in.' })).toBe(true)
    // An ordinary "you may not write to that", a blocked account, a removed one.
    expect(isSecondStepNeeded({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false)
    expect(isSecondStepNeeded({ code: '42501', details: 'account_blocked' })).toBe(false)
    expect(isSecondStepNeeded({ code: 'P0001', details: 'second_step_needed' })).toBe(false)
    expect(isSecondStepNeeded(null)).toBe(false)
  })

  it('uses the very words and detail the database raises', () => {
    expect(migration).toContain("detail = 'second_step_needed'")
    expect(migration).toContain("message = 'Enter the code from your authenticator app to finish signing in.'")
  })
})

describe('whether a code is owed', () => {
  const level = (currentLevel: string | null, nextLevel: string | null) => ({ data: { currentLevel, nextLevel }, error: null })

  it('owes nothing with no authenticator, and asks the server nothing to know it', async () => {
    const { fetchSecondStep } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level('aal1', 'aal1'))
    expect(await fetchSecondStep()).toEqual({ needed: false, factorId: null })
    expect(mfa.listFactors).not.toHaveBeenCalled()
  })

  it('owes nothing once the code has been given, or with nobody signed in', async () => {
    const { fetchSecondStep } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level('aal2', 'aal2'))
    expect((await fetchSecondStep()).needed).toBe(false)
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level(null, null))
    expect((await fetchSecondStep()).needed).toBe(false)
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'no' } })
    expect((await fetchSecondStep()).needed).toBe(false)
  })

  it('owes the code to the authenticator that is set up', async () => {
    const { fetchSecondStep } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level('aal1', 'aal2'))
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1' }], all: [{ id: 'f1' }] }, error: null })
    expect(await fetchSecondStep()).toEqual({ needed: true, factorId: 'f1' })
  })

  it('reads the account from the server after a refusal: one set up elsewhere is news to this browser', async () => {
    const { fetchSecondStep, noteSecondStepRefusal } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level('aal1', 'aal1'))
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f9' }], all: [{ id: 'f9' }] }, error: null })
    expect((await fetchSecondStep()).needed).toBe(false)
    noteSecondStepRefusal()
    expect(await fetchSecondStep()).toEqual({ needed: true, factorId: 'f9' })
  })

  it('asks the server after a refusal even when the browser cannot read its own token', async () => {
    const { fetchSecondStep, noteSecondStepRefusal } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('JWT not in base64url format'))
    // Unreadable and nothing refused: nothing is known to be owed, and nobody is held on a guess.
    expect((await fetchSecondStep()).needed).toBe(false)
    expect(mfa.listFactors).not.toHaveBeenCalled()
    noteSecondStepRefusal()
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f3' }], all: [{ id: 'f3' }] }, error: null })
    expect(await fetchSecondStep()).toEqual({ needed: true, factorId: 'f3' })
  })

  it('goes by what the browser remembers when the server cannot be asked', async () => {
    const { fetchSecondStep } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level('aal1', 'aal2'))
    mfa.listFactors.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    getSession.mockResolvedValue({ data: { session: { user: { factors: [{ id: 'old', factor_type: 'totp', status: 'unverified' }, { id: 'f2', factor_type: 'totp', status: 'verified' }] } } } })
    expect(await fetchSecondStep()).toEqual({ needed: true, factorId: 'f2' })
  })

  it('owes nothing when the server says the authenticator is gone (the Owner cleared it)', async () => {
    const { fetchSecondStep } = await fresh()
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(level('aal1', 'aal2'))
    mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null })
    expect((await fetchSecondStep()).needed).toBe(false)
  })
})

describe('the code as typed', () => {
  it('keeps the digits, six at most, whatever was typed round them', async () => {
    const { codeDigits, isWholeCode } = await fresh()
    expect(codeDigits('123 456')).toBe('123456')
    expect(codeDigits('12-34-56-78')).toBe('123456')
    expect(codeDigits('abc')).toBe('')
    expect(isWholeCode('123456')).toBe(true)
    expect(isWholeCode('12345')).toBe(false)
    expect(isWholeCode('12345a')).toBe(false)
  })

  it('says why a code was not accepted in words somebody can act on', async () => {
    const { codeErrorWords } = await fresh()
    expect(codeErrorWords({ message: 'Invalid TOTP code entered' })).toMatch(/enter the one showing now/)
    expect(codeErrorWords({ message: 'Rate limit exceeded' })).toMatch(/Wait a minute/)
    expect(codeErrorWords({ message: 'Something else' })).toBe('Something else')
    expect(codeErrorWords(null)).toMatch(/could not be checked/)
  })

  it('reads a secret in fours', async () => {
    const { secretInFours } = await fresh()
    expect(secretInFours('ABCDEFGHIJ')).toBe('ABCD EFGH IJ')
  })
})

describe('setting one up', () => {
  it('clears a set-up that was started and left, then starts a new one', async () => {
    const { beginEnrolment } = await fresh()
    mfa.listFactors.mockResolvedValue({
      data: { totp: [], all: [{ id: 'left', factor_type: 'totp', status: 'unverified' }, { id: 'phone', factor_type: 'phone', status: 'unverified' }] },
      error: null,
    })
    mfa.unenroll.mockResolvedValue({ data: {}, error: null })
    mfa.enroll.mockResolvedValue({ data: { id: 'new', totp: { uri: 'otpauth://totp/x', secret: 'SECRET', qr_code: '' } }, error: null })
    expect(await beginEnrolment()).toEqual({ factorId: 'new', uri: 'otpauth://totp/x', secret: 'SECRET' })
    expect(mfa.unenroll).toHaveBeenCalledTimes(1)
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'left' })
    expect(mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp' }))
  })

  it('gives the code to the authenticator it belongs to, and says when it is wrong', async () => {
    const { giveCode } = await fresh()
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null })
    await giveCode('f1', '123456')
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code entered' } })
    await expect(giveCode('f1', '000000')).rejects.toMatchObject({ message: 'Invalid TOTP code entered' })
  })
})

describe('the Owner clearing somebody’s', () => {
  it('asks the database, which is what decides who may', async () => {
    const { clearSecondStep, fetchSecondStepPeople } = await fresh()
    rpc.mockResolvedValueOnce({ data: ['u1', 'u2', 7], error: null })
    expect(await fetchSecondStepPeople()).toEqual(['u1', 'u2'])
    rpc.mockResolvedValueOnce({ data: 1, error: null })
    await clearSecondStep('u1')
    expect(rpc).toHaveBeenLastCalledWith('second_step_clear', { p_user: 'u1' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only the Owner can clear somebody’s second step.' } })
    await expect(clearSecondStep('u1')).rejects.toMatchObject({ code: '42501' })
  })

  it('is the Owner’s alone in the database, and closed to visitors', () => {
    expect(migration).toMatch(/second_step_clear[\s\S]*?if not public\.is_super_admin\(auth\.uid\(\)\) then/)
    expect(migration).toContain('revoke all on function public.second_step_clear(uuid) from public, anon;')
    expect(migration).toContain('revoke all on function public.second_step_people() from public, anon;')
  })
})

describe('the request guard', () => {
  it('keeps its own path and its standing when it is replaced', () => {
    // `create or replace` drops both unless they are restated (0333 was the mending of one that did).
    const guard = migration.slice(migration.indexOf('create or replace function public.reject_removed_user()'), migration.indexOf('create or replace function public.second_step_people()'))
    expect(guard).toContain('security definer')
    expect(guard).toContain('set search_path = public')
    // Where somebody stands is still answered at the first step: the page that asks for the code needs nothing else.
    expect(guard).toMatch(/called is distinct from 'my_standing'\s+and coalesce\(claims ->> 'aal', 'aal1'\) <> 'aal2'/)
  })
})

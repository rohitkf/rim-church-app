import { describe, expect, it } from 'vitest'
import { OPEN, isAccountBlocked, isAppClosed, isBlocked, isShutOut, isTurnedAway, standingSchema } from './standing'

/*
 * Where somebody stands with the app (0278, 0279). The database decides;
 * this is reading its answer, and recognising its refusals among the
 * others.
 */

const closed = { title: 'App maintenance', body: '', from: '2026-11-15T09:00:00Z', until: '2026-11-16T09:00:00Z' }
const blocked = { at: '2026-11-11T15:42:00Z' }

describe('standing', () => {
  it('reads what my_standing() answers', () => {
    expect(standingSchema.parse({ closed: null, may_enter: true, blocked: null })).toEqual(OPEN)
    expect(standingSchema.parse({ closed, may_enter: false, blocked: null }).closed?.until).toBe('2026-11-16T09:00:00Z')
    expect(standingSchema.parse({ closed: null, may_enter: true, blocked }).blocked?.at).toBe('2026-11-11T15:42:00Z')
  })

  it('reads a database that has not heard of blocking as not blocked', () => {
    // The app can be ahead of the migration for a moment, and behind it for longer.
    expect(standingSchema.parse({ closed: null, may_enter: true })).toEqual(OPEN)
    expect(standingSchema.parse({ closed: null, may_enter: true }).blocked).toBeNull()
  })

  it('shuts somebody out when the app is closed and they may not come in', () => {
    expect(isShutOut({ closed, may_enter: false, blocked: null })).toBe(true)
    expect(isShutOut({ closed, may_enter: true, blocked: null })).toBe(false)
    expect(isShutOut(OPEN)).toBe(false)
  })

  it('shuts a blocked account out whether or not the app is closed, and whoever they are', () => {
    expect(isBlocked({ closed: null, may_enter: true, blocked })).toBe(true)
    expect(isShutOut({ closed: null, may_enter: true, blocked })).toBe(true)
    expect(isShutOut({ closed, may_enter: true, blocked })).toBe(true)
    expect(isBlocked(OPEN)).toBe(false)
    expect(isBlocked(null)).toBe(false)
  })

  it('shuts nobody out on no answer', () => {
    expect(isShutOut(null)).toBe(false)
    expect(isShutOut(undefined)).toBe(false)
  })
})

describe('a request refused because the app is closed', () => {
  it('is known by the reason the hook gives', () => {
    expect(isAppClosed({ code: '42501', message: 'The app is closed for maintenance.', details: 'app_closed' })).toBe(true)
    expect(isAppClosed({ code: '42501', message: 'The app is closed for maintenance.' })).toBe(true)
  })

  it('is not an ordinary "you may not write to that", which has the same code', () => {
    expect(isAppClosed({ code: '42501', message: 'new row violates row-level security policy for table "services"' })).toBe(false)
    expect(isAppClosed({ code: '42501', message: 'Your account is no longer active.', details: 'account_removed' })).toBe(false)
  })

  it('is not any other error that happens to say so', () => {
    expect(isAppClosed({ code: 'PGRST116', message: 'The app is closed for maintenance.' })).toBe(false)
    expect(isAppClosed(new Error('offline'))).toBe(false)
    expect(isAppClosed(null)).toBe(false)
  })
})

describe('a request refused because the account is blocked', () => {
  it('is known by the reason the hook gives', () => {
    expect(isAccountBlocked({ code: '42501', message: 'Your account has been blocked by an administrator.', details: 'account_blocked' })).toBe(true)
    expect(isAccountBlocked({ code: '42501', message: 'Your account has been blocked by an administrator.' })).toBe(true)
  })

  it('is not the app being closed, an account removed, or an ordinary refusal', () => {
    expect(isAccountBlocked({ code: '42501', message: 'The app is closed for maintenance.', details: 'app_closed' })).toBe(false)
    expect(isAccountBlocked({ code: '42501', message: 'Your account is no longer active.', details: 'account_removed' })).toBe(false)
    expect(isAccountBlocked({ code: '42501', message: 'new row violates row-level security policy for table "services"' })).toBe(false)
    expect(isAccountBlocked({ code: 'P0001', message: 'Only the owner can block another Admin\'s account' })).toBe(false)
    expect(isAccountBlocked(null)).toBe(false)
  })

  it('and being closed are the two refusals my_standing() can explain', () => {
    expect(isTurnedAway({ code: '42501', details: 'account_blocked' })).toBe(true)
    expect(isTurnedAway({ code: '42501', details: 'app_closed' })).toBe(true)
    expect(isTurnedAway({ code: '42501', details: 'account_removed' })).toBe(false)
    expect(isTurnedAway({ code: '42501', details: 'not_an_rpc' })).toBe(false)
    expect(isAppClosed({ code: '42501', details: 'account_blocked', message: 'Your account has been blocked by an administrator.' })).toBe(false)
  })
})

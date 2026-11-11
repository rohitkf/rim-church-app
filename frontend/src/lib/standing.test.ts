import { describe, expect, it } from 'vitest'
import { OPEN, isAppClosed, isShutOut, standingSchema } from './standing'

/*
 * Where somebody stands with the app (0278). The database decides; this
 * is reading its answer, and recognising its refusal among the others.
 */

const closed = { title: 'App maintenance', body: '', from: '2026-11-15T09:00:00Z', until: '2026-11-16T09:00:00Z' }

describe('standing', () => {
  it('reads what my_standing() answers', () => {
    expect(standingSchema.parse({ closed: null, may_enter: true })).toEqual(OPEN)
    expect(standingSchema.parse({ closed, may_enter: false }).closed?.until).toBe('2026-11-16T09:00:00Z')
  })

  it('shuts somebody out only when the app is closed and they may not come in', () => {
    expect(isShutOut({ closed, may_enter: false })).toBe(true)
    expect(isShutOut({ closed, may_enter: true })).toBe(false)
    expect(isShutOut(OPEN)).toBe(false)
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

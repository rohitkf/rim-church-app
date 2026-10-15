import { describe, expect, it } from 'vitest'
import { tourStatusOf } from './onboarding'

describe('where somebody is with the tour', () => {
  it('has never been touched', () => {
    expect(tourStatusOf(undefined)).toEqual({ kind: 'never' })
    expect(tourStatusOf({ user_id: 'u', seen: {}, pushed_at: null })).toEqual({ kind: 'never' })
  })

  it('was taken, at its latest chapter', () => {
    expect(
      tourStatusOf({ user_id: 'u', seen: { welcome: '2026-10-01T10:00:00Z', church: '2026-10-02T10:00:00Z' }, pushed_at: null }),
    ).toEqual({ kind: 'taken', at: '2026-10-02T10:00:00Z' })
  })

  it('was sent and is still waiting, until a chapter is seen after the send', () => {
    const row = { user_id: 'u', seen: { welcome: '2026-10-01T10:00:00Z' }, pushed_at: '2026-10-03T10:00:00Z' }
    expect(tourStatusOf(row)).toEqual({ kind: 'sent', at: '2026-10-03T10:00:00Z' })
    expect(tourStatusOf({ ...row, seen: { welcome: '2026-10-04T10:00:00Z' } })).toEqual({
      kind: 'taken',
      at: '2026-10-04T10:00:00Z',
    })
    expect(tourStatusOf({ user_id: 'u', seen: {}, pushed_at: '2026-10-03T10:00:00Z' })).toEqual({
      kind: 'sent',
      at: '2026-10-03T10:00:00Z',
    })
  })
})

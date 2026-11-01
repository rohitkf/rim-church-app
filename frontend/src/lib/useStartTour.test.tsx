import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStartTour } from './useStartTour'
import { currentTour, endTour } from './tour'

const who = vi.hoisted(() => ({ standing: 'member', isSuperAdmin: false, onATeam: true }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: who.isSuperAdmin }) }))
vi.mock('./usePageAccess', () => ({
  usePageAccess: () => ({ standing: who.standing, canOpen: () => true, settled: true }),
}))
vi.mock('./useTourContext', () => ({
  useTourContext: () => ({ firstName: 'Ada', onATeam: who.onATeam, canOpen: () => true, roomOpen: () => true }),
}))

beforeEach(() => endTour())

describe('Take the tour, from the account menu', () => {
  it('starts the whole tour for your standing as it is now', () => {
    renderHook(() => useStartTour()).result.current()
    expect(currentTour()?.mode).toBe('manual')
    expect(currentTour()?.chapters.map((c) => c.key)).toEqual(['welcome', 'around', 'church', 'serving', 'team', 'talk'])
  })

  it('gives the Owner the Owner’s chapter', () => {
    who.standing = 'admin'
    who.isSuperAdmin = true
    renderHook(() => useStartTour()).result.current()
    expect(currentTour()?.chapters.map((c) => c.key)).toContain('owner')
  })
})

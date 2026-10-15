import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TakeTheTour } from './TakeTheTour'
import { currentTour, endTour } from '../lib/tour'

const who = vi.hoisted(() => ({ standing: 'member', isSuperAdmin: false, onATeam: true }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: who.isSuperAdmin }) }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({ standing: who.standing, canOpen: () => true, settled: true }),
}))
vi.mock('../lib/useTourContext', () => ({
  useTourContext: () => ({ firstName: 'Ada', onATeam: who.onATeam, canOpen: () => true, roomOpen: () => true }),
}))

beforeEach(() => endTour())

describe('Take the tour, from your profile', () => {
  it('starts the whole tour for your standing as it is now', async () => {
    render(<TakeTheTour />)
    await userEvent.click(screen.getByRole('button', { name: 'Take the tour' }))
    expect(currentTour()?.mode).toBe('manual')
    expect(currentTour()?.chapters.map((c) => c.key)).toEqual(['welcome', 'around', 'church', 'serving', 'team', 'talk'])
  })

  it('gives the Owner the Owner’s chapter', async () => {
    who.standing = 'admin'
    who.isSuperAdmin = true
    render(<TakeTheTour />)
    await userEvent.click(screen.getByRole('button', { name: 'Take the tour' }))
    expect(currentTour()?.chapters.map((c) => c.key)).toContain('owner')
  })
})

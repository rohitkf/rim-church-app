import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneCheckDialog } from './PhoneCheckDialog'
import { endTour } from '../lib/tour'

const auth = vi.hoisted(() => ({
  profile: { id: 'me', phone: '07912345678' } as { id: string; phone: string | null } | null,
  viewAs: null as unknown,
  refreshProfile: vi.fn(() => Promise.resolve()),
}))
const db = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[] }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (row: Record<string, unknown>) => {
        db.updates.push(row)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  },
}))

beforeEach(() => {
  endTour()
  sessionStorage.clear()
  auth.profile = { id: 'me', phone: '07912345678' }
  auth.viewAs = null
  auth.refreshProfile.mockClear()
  db.updates = []
})

describe('the phone check', () => {
  it('offers an older number with its guessed country, and saves it only when told', async () => {
    render(<PhoneCheckDialog />)
    expect(await screen.findByText('Check your phone number')).toBeInTheDocument()
    expect(screen.getByText(/We’ll save it as \+44 7912 345678/)).toBeInTheDocument()
    expect(db.updates).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Save number' }))
    await waitFor(() => expect(db.updates).toEqual([{ phone: '+447912345678' }]))
    expect(auth.refreshProfile).toHaveBeenCalled()
  })

  it('leaves the number alone on Not now, and stays away for the visit', async () => {
    const { unmount } = render(<PhoneCheckDialog />)
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByText('Check your phone number')).toBeNull()
    unmount()
    render(<PhoneCheckDialog />)
    expect(screen.queryByText('Check your phone number')).toBeNull()
    expect(db.updates).toEqual([])
  })

  it('does not ask somebody with a full number, nobody with none, nor an Admin previewing', () => {
    auth.profile = { id: 'me', phone: '+447912345678' }
    const a = render(<PhoneCheckDialog />)
    expect(a.container.textContent).toBe('')
    a.unmount()
    auth.profile = { id: 'me', phone: null }
    const b = render(<PhoneCheckDialog />)
    expect(b.container.textContent).toBe('')
    b.unmount()
    auth.profile = { id: 'me', phone: '07912345678' }
    auth.viewAs = { as: 'church' }
    render(<PhoneCheckDialog />)
    expect(screen.queryByText('Check your phone number')).toBeNull()
  })
})

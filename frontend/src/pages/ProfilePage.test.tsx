import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfilePage } from './ProfilePage'
import { Toaster } from '../components/Toaster'

/*
 * The profile saves itself (no Save button), and says so.
 */

const state = vi.hoisted(() => ({
  updates: [] as { table: string; row: Record<string, unknown> }[],
  refreshed: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: false,
    profile: {
      id: 'u1',
      first_name: 'Rohit',
      last_name: 'K',
      email: 'r@example.test',
      phone: null,
      dob: '1990-01-01',
      anniversary: null,
      marital_status: 'single',
    },
    refreshProfile: () => {
      state.refreshed += 1
    },
  }),
}))

vi.mock('../components/FamilyCard', () => ({ FamilyCard: () => null }))
vi.mock('../components/TakeTheTour', () => ({ TakeTheTour: () => null }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { visa_type: 'graduate', has_dbs: false, visa_expiry: null, visa_has_expiry: false, visa_note: null },
              error: null,
            }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          state.updates.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <ProfilePage />
      <Toaster />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.updates = []
  state.refreshed = 0
})

describe('the profile saves itself', () => {
  it('saves a changed name a moment after typing stops, and says so', async () => {
    const user = userEvent.setup()
    show()
    const first = screen.getByDisplayValue('Rohit')
    await user.clear(first)
    await user.type(first, 'Rohan')
    await waitFor(() => expect(state.updates.find((u) => u.table === 'profiles')?.row).toMatchObject({ first_name: 'Rohan' }), {
      timeout: 3000,
    })
    expect(await screen.findByText('Profile saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull()
  })

  it('does not save a blank name over somebody’s name', async () => {
    const user = userEvent.setup()
    show()
    await user.clear(screen.getByDisplayValue('Rohit'))
    await new Promise((r) => setTimeout(r, 1300))
    expect(state.updates.filter((u) => u.table === 'profiles')).toHaveLength(0)
  })

  it('saves the DBS answer as soon as it is given', async () => {
    const user = userEvent.setup()
    show()
    const dbs = await screen.findByRole('group', { name: /DBS/ })
    await user.click(dbs.querySelector('button')!)
    await waitFor(() => expect(state.updates.find((u) => u.table === 'profile_sensitive')?.row).toMatchObject({ has_dbs: true }), {
      timeout: 3000,
    })
    expect(await screen.findByText('Compliance details saved')).toBeInTheDocument()
  })
})

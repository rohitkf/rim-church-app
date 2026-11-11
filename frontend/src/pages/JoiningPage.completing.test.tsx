import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from '../test/pickers'
import { JoiningPage } from './JoiningPage'

/*
 * The same form for somebody already in, with a question unanswered (0276).
 * What matters: what they gave before is there, what is missing is marked
 * before they press anything, and saving sends them back in without
 * re-dating the day they joined.
 */

const state = vi.hoisted(() => ({
  written: [] as { table: string; row: Record<string, unknown> }[],
  refreshed: 0,
  stored: {
    visa_type: 'student',
    visa_has_expiry: null as boolean | null,
    visa_expiry: '2027-09-30' as string | null,
    has_dbs: true,
    visa_note: null as string | null,
  },
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    profile: {
      id: 'u1',
      first_name: 'Grace',
      last_name: 'Mensah',
      email: 'grace@example.com',
      phone: '+447911123456',
      dob: null,
      anniversary: null,
      avatar_url: null,
      marital_status: 'single',
      onboarded_at: '2026-01-05T09:00:00Z',
    },
    refreshProfile: () => {
      state.refreshed += 1
      return Promise.resolve()
    },
    signOut: () => Promise.resolve(),
  }),
}))

vi.mock('../components/AppMark', () => ({ AppMark: () => null }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      refreshSession: () => Promise.resolve({ data: { session: null } }),
    },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.stored, error: null }) }) }),
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          state.written.push({ table, row })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  state.written = []
  state.refreshed = 0
})

describe('completing a profile that has a blank', () => {
  it('says why they are seeing it, and marks what is missing before anything is pressed', async () => {
    render(<JoiningPage completing />)
    expect(screen.getByRole('heading', { name: 'A few details are missing.' })).toBeInTheDocument()
    expect(screen.queryByText(/Welcome/)).toBeNull()
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(within(alert).getAllByRole('button').map((b) => b.textContent)).toEqual(['Date of birth']))
    expect(screen.getByText('Choose your date of birth.')).toBeInTheDocument()
  })

  it('has what they gave before already filled in', async () => {
    render(<JoiningPage completing />)
    expect(screen.getByDisplayValue('Grace')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Your status in the UK' })).toHaveTextContent('Student visa'))
    expect(screen.getByRole('combobox', { name: 'Marital status' })).toHaveTextContent('Single')
    // A date on record answers "does it have one?" by itself.
    expect(within(screen.getByRole('group', { name: 'Does your visa have an expiry date?' })).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true')
    // Answered before, so not asked afresh.
    expect(within(screen.getByRole('group', { name: 'Do you have a valid DBS check?' })).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves the blank, keeps the rest, and leaves the day they joined alone', async () => {
    const user = userEvent.setup()
    render(<JoiningPage completing />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Your status in the UK' })).toHaveTextContent('Student visa'))
    await pickDate(user, screen.getByLabelText('Date of birth'), '1990-04-12')
    await user.click(screen.getByRole('button', { name: 'Save and carry on' }))
    await waitFor(() => expect(state.refreshed).toBe(1))
    const profile = state.written.find((w) => w.table === 'profiles')!.row
    expect(profile).toMatchObject({
      dob: '1990-04-12',
      phone: '+447911123456',
      marital_status: 'single',
      onboarded_at: '2026-01-05T09:00:00Z',
    })
    expect(state.written.find((w) => w.table === 'profile_sensitive')!.row).toMatchObject({
      visa_type: 'student',
      visa_has_expiry: true,
      visa_expiry: '2027-09-30',
      has_dbs: true,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GuestRollCard } from './GuestRollCard'
import type { Guest } from '../lib/guests'

// useErrorText reaches for the session to decide how blunt to be.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))

const roll = vi.fn<() => Guest[]>()
const added = vi.fn()
vi.mock('../lib/guests', async () => {
  const actual = await vi.importActual<typeof import('../lib/guests')>('../lib/guests')
  return {
    ...actual,
    fetchGuests: () => Promise.resolve(roll()),
    addGuest: (fields: { name: string; title?: string | null }) => {
      added(fields)
      return Promise.resolve({ id: 'new', name: fields.name, title: fields.title ?? null, note: null, became_member: null })
    },
  }
})

const updated = vi.fn()
const deleted = vi.fn()
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [{ id: 'p1', first_name: 'Sam', last_name: 'Varghese' }], error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          updated(patch, id)
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          deleted(id)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Godlee Cherian',
  title: 'Pastor',
  note: 'Visiting from Kochi',
  became_member: null,
  ...over,
})

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <GuestRollCard />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  // The section is shut until asked for, like the rest of this page.
  await user.click(await screen.findByRole('button', { name: /Guests/ }))
  return user
}

beforeEach(() => {
  roll.mockReturnValue([guest()])
  added.mockReset()
  updated.mockReset()
  deleted.mockReset()
})

describe('the guest roll', () => {
  it('writes the designation in front of the name', async () => {
    await show()
    expect(await screen.findByText('Pastor Godlee Cherian')).toBeInTheDocument()
    expect(screen.getByText('Visiting from Kochi')).toBeInTheDocument()
  })

  it('adds somebody with a designation', async () => {
    const user = await show()
    await user.type(screen.getByLabelText('Designation'), 'Apostle')
    await user.type(screen.getByLabelText('Guest name'), 'Xavier')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(added).toHaveBeenCalledWith(expect.objectContaining({ name: 'Xavier', title: 'Apostle' })),
    )
  })

  /*
   * The duplicates this whole change exists for. Twenty-nine rows in this
   * church's old table were twenty-three people.
   */
  it('refuses a name already on the list, whatever the capitals', async () => {
    const user = await show()
    await user.type(screen.getByLabelText('Guest name'), 'godlee cherian')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText(/already on the list/)).toBeInTheDocument()
    expect(added).not.toHaveBeenCalled()
  })

  it('points a guest at the account they turn out to have', async () => {
    const user = await show()
    await user.click(await screen.findByRole('button', { name: 'Now a member' }))

    const dialog = screen.getByRole('dialog')
    // It opens searching for the guest's own name, which is who you are
    // looking for nine times in ten.
    expect(within(dialog).getByLabelText('Search people')).toHaveValue('Godlee Cherian')

    await user.clear(within(dialog).getByLabelText('Search people'))
    await user.type(within(dialog).getByLabelText('Search people'), 'Sam')
    await user.click(within(dialog).getByRole('button', { name: 'Sam Varghese' }))

    await waitFor(() => expect(updated).toHaveBeenCalledWith({ became_member: 'p1' }, 'g1'))
  })

  it('keeps the ones who joined, out of the way rather than deleted', async () => {
    // A running order from March still names them, and that name has to
    // resolve to somebody.
    roll.mockReturnValue([guest({ became_member: 'p1' })])
    await show()
    expect(await screen.findByText('Now members')).toBeInTheDocument()
    expect(screen.getByText('Pastor Godlee Cherian')).toBeInTheDocument()
  })

  it('asks before removing somebody', async () => {
    const user = await show()
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(deleted).not.toHaveBeenCalled()

    const asked = screen.getByRole('alertdialog')
    await user.click(within(asked).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(deleted).toHaveBeenCalledWith('g1'))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GuestRollCard } from './GuestRollCard'
import type { Family } from '../lib/families'
import type { Guest } from '../lib/guests'

/*
 * Somebody who joins is linked once (0332). A guest who is also written
 * into a family by hand is linked in both places from "Now a member":
 * the family entry is offered on a tick, and one press does both.
 */

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))

const state = vi.hoisted(() => ({
  families: [] as unknown[],
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  updates: [] as { patch: Record<string, unknown>; id: string }[],
  refuse: null as string | null,
}))

vi.mock('../lib/guests', async () => {
  const actual = await vi.importActual<typeof import('../lib/guests')>('../lib/guests')
  const sam: Guest = { id: 'g1', name: 'Sam Varghese', title: 'Pastor', note: null, became_member: null }
  return { ...actual, fetchGuests: () => Promise.resolve([sam]) }
})

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcs.push({ name, args })
      if (name === 'families') return Promise.resolve({ data: state.families, error: null })
      if (state.refuse) return Promise.resolve({ data: null, error: { message: state.refuse } })
      return Promise.resolve({ data: { guest: true, family: [{ word: 'husband', beside: 'Anna' }] }, error: null })
    },
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [{ id: 'p1', first_name: 'Sam', last_name: 'Varghese' }], error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          state.updates.push({ patch, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const annasHome: Family = {
  id: 'h1',
  members: [
    { id: 'row-anna', user_id: 'u-anna', kind: 'adult', first_name: 'Anna', last_name: 'Varghese', gender: 'female' },
    { id: 'w-sam', user_id: null, kind: 'adult', first_name: 'Sam', last_name: 'Varghese', gender: 'male' },
  ],
}

async function open(linksFamilies: boolean) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <GuestRollCard linksFamilies={linksFamilies} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Guests/ }))
  await user.click(await screen.findByRole('button', { name: 'Now a member' }))
  return user
}

const joined = () => state.rpcs.filter((r) => r.name === 'person_joined').map((r) => r.args)

beforeEach(() => {
  state.families = [annasHome]
  state.rpcs = []
  state.updates = []
  state.refuse = null
})

describe('a guest who is also written into a family', () => {
  it('is asked about once, with the family entry ticked, and one press links both', async () => {
    const user = await open(true)
    const dialog = screen.getByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Sam Varghese' }))

    // Nothing is linked on choosing the name: there is a family entry to ask about.
    expect(state.updates).toEqual([])
    const also = within(dialog).getByRole('group', { name: 'Link them in a family too' })
    const tick = within(also).getByRole('checkbox', { name: 'Sam Varghese, written in as Anna’s husband' })
    expect(tick).toBeChecked()

    await user.click(within(also).getByRole('button', { name: 'Link both' }))
    await waitFor(() => expect(joined()).toEqual([{ p_account: 'p1', p_guest: 'g1', p_written: ['w-sam'] }]))
    // One call did both: the guest list was not written to on its own.
    expect(state.updates).toEqual([])
    expect(await screen.findByRole('status')).toHaveTextContent('Linked on the guest list and in the family: Sam Varghese, written in as Anna’s husband.')
  })

  it('links the guest alone when the tick is taken off', async () => {
    const user = await open(true)
    const dialog = screen.getByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Sam Varghese' }))
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Link the guest only' }))
    await waitFor(() => expect(state.updates).toEqual([{ patch: { became_member: 'p1' }, id: 'g1' }]))
    expect(joined()).toEqual([])
  })

  it('shows the refusal and links neither', async () => {
    state.refuse = 'Sam already has a husband or wife linked. Unlink them first.'
    const user = await open(true)
    const dialog = screen.getByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Sam Varghese' }))
    await user.click(within(dialog).getByRole('button', { name: 'Link both' }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(state.updates).toEqual([])
    // Still open, to go back and link the guest alone.
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('is one tap, as before, when no family has them written in', async () => {
    state.families = []
    const user = await open(true)
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Sam Varghese' }))
    await waitFor(() => expect(state.updates).toEqual([{ patch: { became_member: 'p1' }, id: 'g1' }]))
    expect(joined()).toEqual([])
  })

  it('never asks the families of a reader who may not link them', async () => {
    const user = await open(false)
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Sam Varghese' }))
    await waitFor(() => expect(state.updates).toEqual([{ patch: { became_member: 'p1' }, id: 'g1' }]))
    expect(state.rpcs.filter((r) => r.name === 'families')).toEqual([])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { chooseOption } from '../test/select'
import { FamilyLinksDialog } from './FamilyLinksDialog'

/*
 * One person's family, linked for them (0319): who is linked, linking
 * somebody else, and unlinking. Nothing is one tap, because a link tells
 * two people something about their family.
 */

type Answer = { data?: unknown; error: unknown }
const db = vi.hoisted(() => ({
  rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error: unknown }>>(),
  found: [] as { id: string; first_name: string; last_name: string }[],
  admin: true,
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => db.rpc(name, args) },
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: db.admin, isSuperAdmin: false }) }))
// The name box asks for accounts as it is typed in; here it finds what the test says.
vi.mock('../lib/family', async (orig) => ({
  ...(await orig<typeof import('../lib/family')>()),
  findPeople: () => Promise.resolve(db.found),
}))

const anna = { id: 'u-anna', first_name: 'Anna', last_name: 'Thomas' }
const ben = { id: 'u-ben', first_name: 'Ben', last_name: 'Thomas' }
const cara = { id: 'u-cara', first_name: 'Cara', last_name: 'Thomas' }
const dan = { id: 'u-dan', first_name: 'Dan', last_name: 'Jacob' }

let family: Record<string, unknown>
const answers = (extra: Partial<Record<string, Answer>> = {}) =>
  db.rpc.mockImplementation((name) => Promise.resolve(extra[name] ?? (name === 'family_of' ? { data: family, error: null } : { data: null, error: null })))

function open(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <FamilyLinksDialog person={anna} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate, user: userEvent.setup() }
}

const calls = (name: string) => db.rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args)
const section = (name: string) => screen.findByRole('region', { name })

beforeEach(() => {
  db.rpc.mockReset()
  db.found = []
  db.admin = true
  family = { spouse: [], children: [], parents: [], written: { spouse: 0, children: 0, parents: 0 } }
  answers()
})

describe('somebody’s family, for whoever links families', () => {
  it('names the person and says a link needs nobody’s yes and that they are told', async () => {
    open()
    expect(screen.getByRole('heading', { name: 'Anna Thomas’s family' })).toBeInTheDocument()
    expect(screen.getByText(/nobody having to\s+confirm/)).toHaveTextContent(/each of them is told/)
    await section('Husband or wife')
    expect(calls('family_of')).toEqual([{ p_person: 'u-anna' }])
  })

  it('says nobody is linked, three times, for somebody on their own', async () => {
    open()
    for (const name of ['Husband or wife', 'Children', 'Parents']) {
      expect(within(await section(name)).getByText('Nobody linked.')).toBeInTheDocument()
    }
  })

  it('lists who is linked, each under what they are', async () => {
    family = { spouse: [ben], children: [cara], parents: [dan], written: { spouse: 0, children: 0, parents: 0 } }
    open()
    expect(within(await section('Husband or wife')).getByText('Ben Thomas')).toBeInTheDocument()
    expect(within(await section('Children')).getByText('Cara Thomas')).toBeInTheDocument()
    expect(within(await section('Parents')).getByText('Dan Jacob')).toBeInTheDocument()
  })

  it('says how many are written in by hand, and never who', async () => {
    family = { spouse: [], children: [cara], parents: [], written: { spouse: 1, children: 2, parents: 0 } }
    open()
    expect(within(await section('Children')).getByText('2 children are written in by hand on their profile, with no account.')).toBeInTheDocument()
    expect(within(await section('Husband or wife')).getByText(/written in by hand.*takes its place/)).toBeInTheDocument()
    expect(within(await section('Parents')).queryByText(/written in by hand/)).not.toBeInTheDocument()
  })

  it('says so when the reader may not link families', async () => {
    db.admin = false
    answers({ family_of: { data: null, error: { code: 'P0001', message: 'You do not have permission to link families.' } } })
    open()
    expect(await screen.findByText('You do not have permission to link families.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Link somebody' })).not.toBeInTheDocument()
  })
})

describe('linking somebody', () => {
  const pick = async (user: ReturnType<typeof userEvent.setup>, typed: string, name: string) => {
    await user.type(await screen.findByRole('textbox', { name: 'Name of the person to link' }), typed)
    await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
  }

  it('offers the three ways, in the person’s own name', async () => {
    const { user } = open()
    const select = await screen.findByRole('combobox', { name: 'What they are to Anna' })
    expect(select).toHaveTextContent('Anna’s husband or wife')
    await user.click(select)
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => (o.textContent ?? '').replace('✓', ''))).toEqual(['Anna’s husband or wife', 'Anna’s child', 'Anna’s parent'])
  })

  it('never offers to write somebody in by hand: only an account can be linked', async () => {
    db.found = [ben]
    const { user } = open()
    await user.type(await screen.findByRole('textbox', { name: 'Name of the person to link' }), 'be')
    await screen.findByRole('button', { name: /Ben Thomas/ })
    expect(screen.queryByRole('button', { name: /by hand/ })).not.toBeInTheDocument()
  })

  it('does not link on choosing a name: it says what it is about to do and asks', async () => {
    db.found = [ben]
    const { user } = open()
    await pick(user, 'be', 'Ben Thomas')
    const confirm = screen.getByRole('group', { name: 'Confirm the link' })
    expect(confirm).toHaveTextContent('Link Ben Thomas as Anna’s husband or wife?')
    expect(calls('link_family')).toEqual([])
    // And can be backed out of.
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm the link' })).not.toBeInTheDocument()
    expect(calls('link_family')).toEqual([])
  })

  it('links husband and wife, says so, and reads the family again', async () => {
    db.found = [ben]
    const { user, invalidate } = open()
    await pick(user, 'be', 'Ben Thomas')
    family = { spouse: [ben], children: [], parents: [], written: { spouse: 0, children: 0, parents: 0 } }
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ben Thomas is now linked as Anna’s husband or wife. They have both been told.')
    expect(calls('link_family')).toEqual([{ p_person: 'u-anna', p_relative: 'u-ben', p_relation: 'spouse' }])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['family'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['married-couples'] })
    expect(within(await section('Husband or wife')).getByText('Ben Thomas')).toBeInTheDocument()
  })

  it('links a child as a child, and a parent as a parent', async () => {
    db.found = [cara]
    const { user } = open()
    await chooseOption(user, await screen.findByRole('combobox', { name: 'What they are to Anna' }), 'Anna’s child')
    await pick(user, 'ca', 'Cara Thomas')
    expect(screen.getByRole('group', { name: 'Confirm the link' })).toHaveTextContent('Link Cara Thomas as Anna’s child?')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await screen.findByRole('status')

    db.found = [dan]
    await chooseOption(user, screen.getByRole('combobox', { name: 'What they are to Anna' }), 'Anna’s parent')
    await pick(user, 'da', 'Dan Jacob')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await waitFor(() => expect(calls('link_family')).toHaveLength(2))
    expect(calls('link_family')).toEqual([
      { p_person: 'u-anna', p_relative: 'u-cara', p_relation: 'child' },
      { p_person: 'u-anna', p_relative: 'u-dan', p_relation: 'parent' },
    ])
  })

  it('shows what the database says when it refuses, and keeps the choice to try another way', async () => {
    db.found = [dan]
    answers({ link_family: { error: { code: 'P0001', message: 'Anna already has a husband or wife linked. Unlink them first.' } } })
    const { user } = open()
    await pick(user, 'da', 'Dan Jacob')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anna already has a husband or wife linked. Unlink them first.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Confirm the link' })).toBeInTheDocument()
  })
})

describe('unlinking somebody', () => {
  beforeEach(() => {
    family = { spouse: [ben], children: [cara], parents: [], written: { spouse: 0, children: 0, parents: 0 } }
  })

  it('says what it takes away before it does anything', async () => {
    const { user } = open()
    await user.click(await screen.findByRole('button', { name: 'Unlink Ben Thomas' }))
    const asking = screen.getByRole('group', { name: 'Unlink Ben Thomas?' })
    expect(asking).toHaveTextContent('Ben leaves Anna’s household. The address and any children on it stay with Anna.')
    expect(calls('unlink_family')).toEqual([])
    await user.click(within(asking).getByRole('button', { name: 'Keep the link' }))
    expect(screen.queryByRole('group', { name: 'Unlink Ben Thomas?' })).not.toBeInTheDocument()
    expect(calls('unlink_family')).toEqual([])
  })

  it('says a child is unlinked from both of a couple', async () => {
    const { user } = open()
    await user.click(await screen.findByRole('button', { name: 'Unlink Cara Thomas' }))
    expect(screen.getByRole('group', { name: 'Unlink Cara Thomas?' })).toHaveTextContent(
      'Cara stops being linked as the child of Anna and of Ben: the two share one household.',
    )
  })

  it('unlinks, says so, and reads the family again', async () => {
    const { user, invalidate } = open()
    await user.click(await screen.findByRole('button', { name: 'Unlink Ben Thomas' }))
    family = { spouse: [], children: [cara], parents: [], written: { spouse: 0, children: 0, parents: 0 } }
    await user.click(within(screen.getByRole('group', { name: 'Unlink Ben Thomas?' })).getByRole('button', { name: 'Unlink' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ben Thomas is no longer linked to Anna. They have both been told.')
    expect(calls('unlink_family')).toEqual([{ p_person: 'u-anna', p_relative: 'u-ben' }])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['family'] })
    await waitFor(async () => expect(within(await section('Husband or wife')).getByText('Nobody linked.')).toBeInTheDocument())
  })

  it('shows a refusal and leaves the link as it was', async () => {
    answers({ unlink_family: { error: { code: 'P0001', message: 'Those two are not linked.' } } })
    const { user } = open()
    await user.click(await screen.findByRole('button', { name: 'Unlink Ben Thomas' }))
    await user.click(within(screen.getByRole('group', { name: 'Unlink Ben Thomas?' })).getByRole('button', { name: 'Unlink' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Those two are not linked.')
    expect(screen.getByText('Ben Thomas')).toBeInTheDocument()
  })

  it('closes on Done', async () => {
    const { user, onClose } = open()
    await user.click(await screen.findByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})

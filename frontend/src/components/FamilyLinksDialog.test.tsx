import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { chooseOption } from '../test/select'
import { FamilyLinksDialog } from './FamilyLinksDialog'

/*
 * One person's family, linked for them (0319): who is linked, linking
 * somebody else, and unlinking. Somebody not on the app is written in by
 * hand, changed and taken off (0320). Nothing is one tap, because a
 * change tells a family something about itself.
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
const nobody = () => ({ spouse: [] as unknown[], children: [] as unknown[], parents: [] as unknown[] })
/** A family as the database hands it over: linked accounts, and people written in. */
const fam = (linked: Partial<ReturnType<typeof nobody>> = {}, written: Partial<ReturnType<typeof nobody>> = {}) => ({
  ...nobody(),
  ...linked,
  written_people: { ...nobody(), ...written },
})
const ravi = { id: 'w-ravi', first_name: 'Ravi', last_name: 'Kumar', dob: null, gender: null, school: null, year_group: null }
const zak = { id: 'w-zak', first_name: 'Zak', last_name: 'Thomas', dob: '2018-01-02', gender: 'male', school: 'Hill Primary', year_group: 'Year 3' }
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
  family = fam()
  answers()
})

describe('somebody’s family, for whoever links families', () => {
  it('names the person and says a link needs nobody’s yes and that they are told', async () => {
    open()
    expect(screen.getByRole('heading', { name: 'Anna Thomas’s family' })).toBeInTheDocument()
    expect(screen.getByText(/nobody having to\s+confirm/)).toHaveTextContent(/written in by hand\. The family is told of each change\./)
    await section('Husband or wife')
    expect(calls('family_of')).toEqual([{ p_person: 'u-anna' }])
  })

  it('says nobody is listed, three times, for somebody on their own', async () => {
    open()
    for (const name of ['Husband or wife', 'Children', 'Parents']) {
      expect(within(await section(name)).getByText('Nobody listed.')).toBeInTheDocument()
    }
  })

  it('lists who is linked, each under what they are', async () => {
    family = fam({ spouse: [ben], children: [cara], parents: [dan] })
    open()
    expect(within(await section('Husband or wife')).getByText('Ben Thomas')).toBeInTheDocument()
    expect(within(await section('Children')).getByText('Cara Thomas')).toBeInTheDocument()
    expect(within(await section('Parents')).getByText('Dan Jacob')).toBeInTheDocument()
  })

  it('says so when the reader may not link families', async () => {
    db.admin = false
    answers({ family_of: { data: null, error: { code: 'P0001', message: 'You do not have permission to link families.' } } })
    open()
    expect(await screen.findByText('You do not have permission to link families.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Add somebody' })).not.toBeInTheDocument()
  })
})

describe('linking somebody', () => {
  const pick = async (user: ReturnType<typeof userEvent.setup>, typed: string, name: string) => {
    await user.type(await screen.findByRole('textbox', { name: 'Name of the person to add' }), typed)
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
    family = fam({ spouse: [ben] })
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
    family = fam({ spouse: [ben], children: [cara] })
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
    family = fam({ children: [cara] })
    await user.click(within(screen.getByRole('group', { name: 'Unlink Ben Thomas?' })).getByRole('button', { name: 'Unlink' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ben Thomas is no longer linked to Anna. They have both been told.')
    expect(calls('unlink_family')).toEqual([{ p_person: 'u-anna', p_relative: 'u-ben' }])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['family'] })
    await waitFor(async () => expect(within(await section('Husband or wife')).getByText('Nobody listed.')).toBeInTheDocument())
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

describe('somebody who is not on the app', () => {
  const writeIn = async (user: ReturnType<typeof userEvent.setup>, typed: string) => {
    await user.type(await screen.findByRole('textbox', { name: 'Name of the person to add' }), typed)
    await user.click(await screen.findByRole('button', { name: /Not on the app\? Add/ }))
  }

  it('is listed under what they are, marked as having no account, with what is written about them', async () => {
    family = fam({ spouse: [] }, { spouse: [ravi], children: [zak] })
    open()
    const husband = within(await section('Husband or wife')).getByText(/Ravi Kumar/)
    expect(husband).toHaveTextContent('Ravi Kumar No account')
    const children = await section('Children')
    expect(within(children).getByText(/Zak Thomas/)).toHaveTextContent('No account')
    expect(within(children).getByText(/Boy · Year 3 · Hill Primary/)).toHaveTextContent(/2018 \(\d+\)/)
    // And what happens when they join is said once.
    expect(screen.getByText('When somebody written in joins the app, link their account here and it takes their place.')).toBeInTheDocument()
  })

  it('says nothing about joining when nobody is written in', async () => {
    family = fam({ spouse: [ben] })
    open()
    await section('Husband or wife')
    expect(screen.queryByText(/joins the app/)).not.toBeInTheDocument()
  })

  it('is offered as soon as a name is typed, and opens the form with the name split', async () => {
    const { user } = open()
    await writeIn(user, 'ravi kumar')
    const form = screen.getByRole('group', { name: 'Write in Anna’s husband or wife' })
    expect(form).toHaveTextContent('Not on the app: written in as Anna’s husband or wife, until they join.')
    expect(within(form).getByRole('textbox', { name: 'First name' })).toHaveValue('ravi')
    expect(within(form).getByRole('textbox', { name: 'Last name' })).toHaveValue('kumar')
    // A husband or wife is asked no school.
    expect(within(form).queryByRole('textbox', { name: 'School' })).not.toBeInTheDocument()
    expect(calls('save_family_person')).toEqual([])
  })

  it('writes a husband or wife in, says so, and reads the family again', async () => {
    const { user, invalidate } = open()
    await writeIn(user, 'ravi kumar')
    family = fam({}, { spouse: [ravi] })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ravi Kumar is written in as Anna’s husband or wife. The family has been told.')
    expect(calls('save_family_person')).toEqual([
      { p_person: 'u-anna', p_relation: 'spouse', p_id: null, p_first: 'Ravi', p_last: 'Kumar', p_dob: null, p_gender: null, p_school: '', p_year: '' },
    ])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['family'] })
    expect(within(await section('Husband or wife')).getByText(/Ravi Kumar/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Write in/ })).not.toBeInTheDocument()
  })

  it('asks a child’s school and year, and writes them in as a child', async () => {
    const { user } = open()
    await chooseOption(user, await screen.findByRole('combobox', { name: 'What they are to Anna' }), 'Anna’s child')
    await writeIn(user, 'zak')
    const form = screen.getByRole('group', { name: 'Write in Anna’s child' })
    await user.type(within(form).getByRole('textbox', { name: 'School' }), 'Hill Primary')
    await user.type(within(form).getByRole('textbox', { name: 'Year group' }), 'Year 3')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByRole('status')
    expect(calls('save_family_person')).toEqual([
      { p_person: 'u-anna', p_relation: 'child', p_id: null, p_first: 'Zak', p_last: '', p_dob: null, p_gender: null, p_school: 'Hill Primary', p_year: 'Year 3' },
    ])
  })

  it('shows a refusal and keeps what was typed', async () => {
    answers({ save_family_person: { error: { code: 'P0001', message: 'Anna already has a husband or wife listed. Unlink or remove them first.' } } })
    const { user } = open()
    await writeIn(user, 'sam jacob')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anna already has a husband or wife listed. Unlink or remove them first.')
    expect(screen.getByRole('textbox', { name: 'First name' })).toHaveValue('Sam')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('can be backed out of', async () => {
    const { user } = open()
    await writeIn(user, 'ravi')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: /Write in/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name of the person to add' })).toBeInTheDocument()
    expect(calls('save_family_person')).toEqual([])
  })

  it('has its details changed in place', async () => {
    family = fam({}, { children: [zak] })
    const { user } = open()
    await user.click(await screen.findByRole('button', { name: 'Change Zak Thomas' }))
    const school = screen.getByRole('textbox', { name: 'School' })
    expect(school).toHaveValue('Hill Primary')
    await user.clear(school)
    await user.type(school, 'Park Academy')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Zak Thomas’s details are saved.')
    expect(calls('save_family_person')).toEqual([
      { p_person: 'u-anna', p_relation: 'child', p_id: 'w-zak', p_first: 'Zak', p_last: 'Thomas', p_dob: '2018-01-02', p_gender: 'male', p_school: 'Park Academy', p_year: 'Year 3' },
    ])
  })

  it('is not removed on one tap: it says what goes and that it cannot be undone', async () => {
    family = fam({}, { spouse: [ravi] })
    const { user } = open()
    await user.click(await screen.findByRole('button', { name: 'Remove Ravi Kumar' }))
    const asking = screen.getByRole('group', { name: 'Remove Ravi Kumar?' })
    expect(asking).toHaveTextContent(/Ravi is written in by hand, so this takes what is written about them off Anna’s family\.\s+It cannot be undone\./)
    expect(calls('remove_family_person')).toEqual([])
    await user.click(within(asking).getByRole('button', { name: 'Keep them' }))
    expect(screen.queryByRole('group', { name: 'Remove Ravi Kumar?' })).not.toBeInTheDocument()
    expect(calls('remove_family_person')).toEqual([])
  })

  it('is removed, says so, and reads the family again', async () => {
    family = fam({}, { spouse: [ravi] })
    const { user } = open()
    await user.click(await screen.findByRole('button', { name: 'Remove Ravi Kumar' }))
    family = fam()
    await user.click(within(screen.getByRole('group', { name: 'Remove Ravi Kumar?' })).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ravi Kumar is taken off Anna’s family.')
    expect(calls('remove_family_person')).toEqual([{ p_person: 'u-anna', p_id: 'w-ravi' }])
    await waitFor(async () => expect(within(await section('Husband or wife')).getByText('Nobody listed.')).toBeInTheDocument())
  })

  it('has no Unlink: that is for an account', async () => {
    family = fam({ spouse: [] }, { spouse: [ravi] })
    open()
    await screen.findByRole('button', { name: 'Remove Ravi Kumar' })
    expect(screen.queryByRole('button', { name: /^Unlink/ })).not.toBeInTheDocument()
  })
})

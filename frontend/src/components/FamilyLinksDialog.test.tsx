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
 *
 * Somebody is added by one of eight words (0328), chosen before the
 * name, and each person already there has their word beside them.
 */

type Answer = { data?: unknown; error: unknown }
const db = vi.hoisted(() => ({
  rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error: unknown }>>(),
  found: [] as { id: string; first_name: string; last_name: string }[],
  guests: [] as { id: string; name: string; title: string | null; note: string | null; became_member: string | null }[],
  admin: true,
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => db.rpc(name, args),
    // The guest list, read only by a reader who may change it (0332).
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: db.guests, error: null }) }) }),
  },
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
const nobody = () => ({ spouse: [] as unknown[], children: [] as unknown[], parents: [] as unknown[], siblings: [] as unknown[] })
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

function open(onClose = vi.fn(), marksGuests = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <FamilyLinksDialog person={anna} onClose={onClose} marksGuests={marksGuests} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate, user: userEvent.setup() }
}

const calls = (name: string) => db.rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args)
const section = (name: string) => screen.findByRole('region', { name })

beforeEach(() => {
  db.rpc.mockReset()
  db.found = []
  db.guests = []
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

  it('says nobody is listed, four times, for somebody on their own', async () => {
    open()
    for (const name of ['Husband or wife', 'Children', 'Parents', 'Brothers and sisters']) {
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

  it('lists brothers and sisters, linked or written in', async () => {
    family = fam({ siblings: [{ ...dan, gender: 'male' }] }, { siblings: [{ ...ravi, gender: null }] })
    open()
    const list = await section('Brothers and sisters')
    expect(within(list).getByText('Dan Jacob')).toBeInTheDocument()
    expect(within(list).getByText(/Ravi Kumar/)).toHaveTextContent('No account')
    expect(within(list).getByRole('combobox', { name: 'What Dan Jacob is to Anna' })).toHaveTextContent('Brother')
    expect(within(list).getByRole('combobox', { name: 'What Ravi Kumar is to Anna' })).toHaveTextContent('Brother or sister')
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
  const word = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
    chooseOption(user, await screen.findByRole('combobox', { name: 'What they are to Anna' }), label)
  const pick = async (user: ReturnType<typeof userEvent.setup>, typed: string, name: string) => {
    await user.type(await screen.findByRole('textbox', { name: 'Name of the person to add' }), typed)
    await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
  }

  it('offers the eight words, in the person’s own name, and starts on none of them', async () => {
    const { user } = open()
    const select = await screen.findByRole('combobox', { name: 'What they are to Anna' })
    expect(select).toHaveTextContent('Choose what they are')
    await user.click(select)
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => (o.textContent ?? '').replace('✓', ''))).toEqual([
      'Anna’s husband',
      'Anna’s wife',
      'Anna’s son',
      'Anna’s daughter',
      'Anna’s father',
      'Anna’s mother',
      'Anna’s brother',
      'Anna’s sister',
    ])
  })

  it('asks for the word before the name', async () => {
    const { user } = open()
    await section('Add somebody')
    expect(screen.queryByRole('textbox', { name: 'Name of the person to add' })).not.toBeInTheDocument()
    expect(screen.getByText('Then give their name: somebody on the app, or somebody to write in.')).toBeInTheDocument()
    await word(user, 'Anna’s wife')
    expect(screen.getByRole('textbox', { name: 'Name of the person to add' })).toBeInTheDocument()
  })

  it('does not link on choosing a name: it says what it is about to do and asks', async () => {
    db.found = [ben]
    const { user } = open()
    await word(user, 'Anna’s husband')
    await pick(user, 'be', 'Ben Thomas')
    const confirm = screen.getByRole('group', { name: 'Confirm the link' })
    expect(confirm).toHaveTextContent('Link Ben Thomas as Anna’s husband?')
    expect(calls('link_family_as')).toEqual([])
    // And can be backed out of.
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm the link' })).not.toBeInTheDocument()
    expect(calls('link_family_as')).toEqual([])
  })

  it('links a husband, says so, and reads the family again', async () => {
    db.found = [ben]
    const { user, invalidate } = open()
    await word(user, 'Anna’s husband')
    await pick(user, 'be', 'Ben Thomas')
    family = fam({ spouse: [{ ...ben, gender: 'male' }] })
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ben Thomas is now linked as Anna’s husband. They have both been told.')
    expect(calls('link_family_as')).toEqual([{ p_person: 'u-anna', p_relative: 'u-ben', p_word: 'husband' }])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['family'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['married-couples'] })
    const list = await section('Husband or wife')
    expect(within(list).getByText('Ben Thomas')).toBeInTheDocument()
    expect(within(list).getByRole('combobox', { name: 'What Ben Thomas is to Anna' })).toHaveTextContent('Husband')
  })

  it('links a daughter as a daughter, and a father as a father', async () => {
    db.found = [cara]
    const { user } = open()
    await word(user, 'Anna’s daughter')
    await pick(user, 'ca', 'Cara Thomas')
    expect(screen.getByRole('group', { name: 'Confirm the link' })).toHaveTextContent('Link Cara Thomas as Anna’s daughter?')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await screen.findByRole('status')

    db.found = [dan]
    await word(user, 'Anna’s father')
    await pick(user, 'da', 'Dan Jacob')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await waitFor(() => expect(calls('link_family_as')).toHaveLength(2))
    expect(calls('link_family_as')).toEqual([
      { p_person: 'u-anna', p_relative: 'u-cara', p_word: 'daughter' },
      { p_person: 'u-anna', p_relative: 'u-dan', p_word: 'father' },
    ])
  })

  it('says, before linking a brother, whose child that makes him', async () => {
    family = fam({ parents: [dan] })
    db.found = [ben]
    const { user } = open()
    await word(user, 'Anna’s brother')
    await pick(user, 'be', 'Ben Thomas')
    expect(screen.getByRole('group', { name: 'Confirm the link' })).toHaveTextContent(
      'Link Ben Thomas as Anna’s brother?That makes Ben the child of Dan too, as Anna is.',
    )
  })

  it('says, once a brother is linked, what the database says moved with him', async () => {
    db.found = [ben]
    answers({ link_family_as: { data: { came: ['Cara'], parents: ['Dan'] }, error: null } })
    const { user } = open()
    await word(user, 'Anna’s brother')
    await pick(user, 'be', 'Ben Thomas')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ben Thomas is now linked as Anna’s brother. They are both down as children of Dan. Cara, already linked as a brother or sister, came too. Everybody it changes has been told.',
    )
  })

  it('says, before linking a mother, that the brothers and sisters become hers too', async () => {
    family = fam({ siblings: [ben] })
    db.found = [dan]
    const { user } = open()
    await word(user, 'Anna’s mother')
    await pick(user, 'da', 'Dan Jacob')
    expect(screen.getByRole('group', { name: 'Confirm the link' })).toHaveTextContent('Ben, Anna’s brother or sister, becomes Dan’s child too.')
  })

  it('shows what the database says when it refuses, and keeps the choice to try another way', async () => {
    db.found = [dan]
    answers({ link_family_as: { error: { code: 'P0001', message: 'Anna already has a husband or wife linked. Unlink them first.' } } })
    const { user } = open()
    await word(user, 'Anna’s husband')
    await pick(user, 'da', 'Dan Jacob')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anna already has a husband or wife linked. Unlink them first.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Confirm the link' })).toBeInTheDocument()
  })
})

describe('the word beside somebody already there', () => {
  it('shows the pair for somebody linked before the words, and holds neither', async () => {
    family = fam({ spouse: [ben], children: [cara], parents: [dan] })
    const { user } = open()
    const picker = await screen.findByRole('combobox', { name: 'What Ben Thomas is to Anna' })
    expect(picker).toHaveTextContent('Husband or wife')
    expect(screen.getByRole('combobox', { name: 'What Cara Thomas is to Anna' })).toHaveTextContent('Child')
    expect(screen.getByRole('combobox', { name: 'What Dan Jacob is to Anna' })).toHaveTextContent('Parent')
    await user.click(picker)
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => (o.textContent ?? '').replace('✓', ''))).toEqual(['Husband', 'Wife'])
    expect(options.every((o) => o.getAttribute('aria-selected') !== 'true')).toBe(true)
  })

  it('says which they are without unlinking them, and tells nobody', async () => {
    family = fam({ spouse: [ben] })
    const { user } = open()
    const picker = await screen.findByRole('combobox', { name: 'What Ben Thomas is to Anna' })
    family = fam({ spouse: [{ ...ben, gender: 'male' }] })
    await chooseOption(user, picker, 'Husband')
    expect(await screen.findByRole('status')).toHaveTextContent('Ben Thomas is down as Anna’s husband.')
    expect(calls('say_family_word')).toEqual([{ p_person: 'u-anna', p_relative: 'u-ben', p_written: null, p_word: 'husband' }])
    expect(calls('unlink_family')).toEqual([])
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'What Ben Thomas is to Anna' })).toHaveTextContent('Husband'))
  })

  it('says it of somebody written in by their entry, not by an account', async () => {
    family = fam({}, { parents: [ravi] })
    const { user } = open()
    await chooseOption(user, await screen.findByRole('combobox', { name: 'What Ravi Kumar is to Anna' }), 'Father')
    await screen.findByRole('status')
    expect(calls('say_family_word')).toEqual([{ p_person: 'u-anna', p_relative: null, p_written: 'w-ravi', p_word: 'father' }])
  })

  it('shows a refusal and leaves the word as it was', async () => {
    family = fam({ children: [{ ...cara, gender: 'female' }] })
    answers({ say_family_word: { error: { code: 'P0001', message: 'That person is not linked to Anna.' } } })
    const { user } = open()
    await chooseOption(user, await screen.findByRole('combobox', { name: 'What Cara Thomas is to Anna' }), 'Son')
    expect(await screen.findByRole('alert')).toHaveTextContent('That person is not linked to Anna.')
    expect(screen.getByRole('combobox', { name: 'What Cara Thomas is to Anna' })).toHaveTextContent('Daughter')
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
  const writeIn = async (user: ReturnType<typeof userEvent.setup>, typed: string, as = 'Anna’s husband') => {
    await chooseOption(user, await screen.findByRole('combobox', { name: 'What they are to Anna' }), as)
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
    expect(within(children).getByText(/Year 3 · Hill Primary/)).toHaveTextContent(/2018 \(\d+\)/)
    // Boy or girl is the word beside him, not one more thing in the line.
    expect(within(children).queryByText(/Boy/)).not.toBeInTheDocument()
    expect(within(children).getByRole('combobox', { name: 'What Zak Thomas is to Anna' })).toHaveTextContent('Son')
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
    const form = screen.getByRole('group', { name: 'Write in Anna’s husband' })
    expect(form).toHaveTextContent('Not on the app: written in as Anna’s husband, until they join.')
    expect(within(form).getByRole('textbox', { name: 'First name' })).toHaveValue('ravi')
    expect(within(form).getByRole('textbox', { name: 'Last name' })).toHaveValue('kumar')
    // A husband is asked no school.
    expect(within(form).queryByRole('textbox', { name: 'School' })).not.toBeInTheDocument()
    expect(calls('save_family_person')).toEqual([])
  })

  it('writes a husband in, says so, and reads the family again', async () => {
    const { user, invalidate } = open()
    await writeIn(user, 'ravi kumar')
    family = fam({}, { spouse: [ravi] })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ravi Kumar is written in as Anna’s husband. The family has been told.')
    expect(calls('save_family_person')).toEqual([
      { p_person: 'u-anna', p_relation: 'husband', p_id: null, p_first: 'Ravi', p_last: 'Kumar', p_dob: null, p_gender: null, p_school: '', p_year: '' },
    ])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['family'] })
    expect(within(await section('Husband or wife')).getByText(/Ravi Kumar/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Write in/ })).not.toBeInTheDocument()
  })

  it('asks a son’s school and year, and starts the form on what the word says', async () => {
    const { user } = open()
    await writeIn(user, 'zak', 'Anna’s son')
    const form = screen.getByRole('group', { name: 'Write in Anna’s son' })
    expect(within(form).getByRole('combobox', { name: 'Gender' })).toHaveTextContent('Boy')
    await user.type(within(form).getByRole('textbox', { name: 'School' }), 'Hill Primary')
    await user.type(within(form).getByRole('textbox', { name: 'Year group' }), 'Year 3')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Zak is written in as Anna’s son. The family has been told.')
    expect(calls('save_family_person')).toEqual([
      { p_person: 'u-anna', p_relation: 'son', p_id: null, p_first: 'Zak', p_last: '', p_dob: null, p_gender: 'male', p_school: 'Hill Primary', p_year: 'Year 3' },
    ])
  })

  it('writes a sister in with a child’s form, as she is a child of the same household', async () => {
    const { user } = open()
    await writeIn(user, 'sue', 'Anna’s sister')
    const form = screen.getByRole('group', { name: 'Write in Anna’s sister' })
    expect(within(form).getByRole('combobox', { name: 'Gender' })).toHaveTextContent('Girl')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Sue is written in as Anna’s sister. The family has been told.')
    expect(calls('save_family_person')[0]).toMatchObject({ p_relation: 'sister', p_gender: 'female' })
  })

  it('says what the form says when it differs from the word: the form is what was last looked at', async () => {
    const { user } = open()
    await writeIn(user, 'sam', 'Anna’s son')
    const form = screen.getByRole('group', { name: 'Write in Anna’s son' })
    await chooseOption(user, within(form).getByRole('combobox', { name: 'Gender' }), 'Girl')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Sam is written in as Anna’s daughter. The family has been told.')
    expect(calls('save_family_person')[0]).toMatchObject({ p_relation: 'son', p_gender: 'female' })
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
      { p_person: 'u-anna', p_relation: null, p_id: 'w-zak', p_first: 'Zak', p_last: 'Thomas', p_dob: '2018-01-02', p_gender: 'male', p_school: 'Park Academy', p_year: 'Year 3' },
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

describe('somebody linked who is also on the guest list (0332)', () => {
  const word = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
    chooseOption(user, await screen.findByRole('combobox', { name: 'What they are to Anna' }), label)
  const pick = async (user: ReturnType<typeof userEvent.setup>, typed: string, name: string) => {
    await user.type(await screen.findByRole('textbox', { name: 'Name of the person to add' }), typed)
    await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
  }
  const benTheGuest = { id: 'g-ben', name: 'Ben Thomas', title: 'Br', note: null, became_member: null }

  it('offers the guest on a tick, and one press links the family and marks the guest a member', async () => {
    db.found = [ben]
    db.guests = [benTheGuest]
    answers({ person_joined: { data: { guest: true, family: [] }, error: null } })
    const { user, invalidate } = open(vi.fn(), true)
    await word(user, 'Anna’s husband')
    await pick(user, 'be', 'Ben Thomas')
    const confirm = screen.getByRole('group', { name: 'Confirm the link' })
    const tick = await within(confirm).findByRole('checkbox', { name: /On the guest list as Br Ben Thomas/ })
    // The whole name is the same and there is one of them: ticked to begin with.
    expect(tick).toBeChecked()

    await user.click(within(confirm).getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ben Thomas is now linked as Anna’s husband. They have both been told. Ben Thomas is also marked as a member on the guest list.',
    )
    expect(calls('link_family_as')).toEqual([{ p_person: 'u-anna', p_relative: 'u-ben', p_word: 'husband' }])
    expect(calls('person_joined')).toEqual([{ p_account: 'u-ben', p_guest: 'g-ben', p_written: null }])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guests'] })
  })

  it('leaves the guest list alone when the tick is taken off', async () => {
    db.found = [ben]
    db.guests = [benTheGuest]
    const { user } = open(vi.fn(), true)
    await word(user, 'Anna’s husband')
    await pick(user, 'be', 'Ben Thomas')
    const confirm = screen.getByRole('group', { name: 'Confirm the link' })
    await user.click(await within(confirm).findByRole('checkbox'))
    await user.click(within(confirm).getByRole('button', { name: 'Link' }))
    await screen.findByRole('status')
    expect(calls('person_joined')).toEqual([])
  })

  it('says so when the family is linked and the guest list would not change', async () => {
    db.found = [ben]
    db.guests = [benTheGuest]
    answers({ person_joined: { error: { message: 'nope' } } })
    const { user } = open(vi.fn(), true)
    await word(user, 'Anna’s husband')
    await pick(user, 'be', 'Ben Thomas')
    await user.click(within(screen.getByRole('group', { name: 'Confirm the link' })).getByRole('button', { name: 'Link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Ben Thomas is now linked as Anna’s husband\..*The guest list was not changed:/)
  })

  it('offers nothing to a reader who may not change the guest list', async () => {
    db.found = [ben]
    db.guests = [benTheGuest]
    const { user } = open()
    await word(user, 'Anna’s husband')
    await pick(user, 'be', 'Ben Thomas')
    expect(within(screen.getByRole('group', { name: 'Confirm the link' })).queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

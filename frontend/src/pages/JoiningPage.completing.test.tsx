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
  /** Their household's address as saved (0149); null is no household yet. */
  home: {
    id: 'h1',
    address_line1: '1 High Street',
    address_line2: null,
    town: 'Leeds',
    postcode: 'LS1 1AA',
  } as { id: string; address_line1: string | null; address_line2: string | null; town: string | null; postcode: string | null } | null,
  /** Who to ring, as on their profile (0301). */
  emergency: {
    name: 'Ama Mensah' as string | null,
    relation: 'mother' as string | null,
    phone: '+447812345678' as string | null,
  },
  addresses: [] as { line1: string; line2: string; town: string; postcode: string }[],
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
      emergency_contact_name: state.emergency.name,
      emergency_contact_relation: state.emergency.relation,
      emergency_contact_phone: state.emergency.phone,
    },
    refreshProfile: () => {
      state.refreshed += 1
      return Promise.resolve()
    },
    signOut: () => Promise.resolve(),
  }),
}))

vi.mock('../components/AppMark', () => ({ AppMark: () => null }))

vi.mock('../lib/family', () => ({
  fetchHouseholds: () => Promise.resolve({ households: state.home ? [state.home] : [], members: [] }),
  myFamily: (data: { households: unknown[] }) => ({ home: data.households[0] ?? null, spouse: null, children: [], parents: [] }),
  saveAddress: (a: { line1: string; line2: string; town: string; postcode: string }) => {
    state.addresses.push(a)
    return Promise.resolve()
  },
}))

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
  state.addresses = []
  state.home = { id: 'h1', address_line1: '1 High Street', address_line2: null, town: 'Leeds', postcode: 'LS1 1AA' }
  state.emergency = { name: 'Ama Mensah', relation: 'mother', phone: '+447812345678' }
})

/** The app's own select: a combobox that opens a list of options. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

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
    // What they gave before goes back as it was: the address and who to ring.
    expect(profile).toMatchObject({
      emergency_contact_name: 'Ama Mensah',
      emergency_contact_relation: 'mother',
      emergency_contact_phone: '+447812345678',
    })
    expect(state.addresses).toEqual([{ line1: '1 High Street', line2: '', town: 'Leeds', postcode: 'LS1 1AA' }])
  })

  /*
   * Everybody who was through the form before 0301: all they are missing
   * is where they live and who to ring.
   */
  it('marks an address and somebody to ring for somebody who has given neither', async () => {
    state.home = null
    state.emergency = { name: null, relation: null, phone: null }
    render(<JoiningPage completing />)
    const alert = await screen.findByRole('alert')
    await waitFor(() =>
      expect(within(alert).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Date of birth',
        'Address line 1',
        'Town or city',
        'Postcode',
        'Emergency contact’s name',
        'Emergency contact’s relationship to you',
        'Emergency contact’s number',
      ]),
    )
    expect(screen.getByText(/your address and somebody to ring in an emergency/)).toBeInTheDocument()
  })

  it('has an address their spouse already gave filled in, and does not ask for it again', async () => {
    state.emergency = { name: null, relation: null, phone: null }
    render(<JoiningPage completing />)
    expect(await screen.findByDisplayValue('1 High Street')).toBeInTheDocument()
    expect(screen.getByDisplayValue('LS1 1AA')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(within(alert).queryByRole('button', { name: 'Address line 1' })).toBeNull()
    expect(within(alert).getByRole('button', { name: 'Emergency contact’s name' })).toBeInTheDocument()
  })

  it('saves the address and who to ring, and lets them back in', async () => {
    const user = userEvent.setup()
    state.home = null
    state.emergency = { name: null, relation: null, phone: null }
    render(<JoiningPage completing />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Your status in the UK' })).toHaveTextContent('Student visa'))
    await pickDate(user, screen.getByLabelText('Date of birth'), '1990-04-12')
    // Marked from the start, so each label carries its message too.
    await user.type(await screen.findByLabelText(/^Address line 1/), '22 Park Row')
    await user.type(screen.getByLabelText(/^Address line 2/), 'Flat 3')
    await user.type(screen.getByLabelText(/^Town or city/), 'Leeds')
    await user.type(screen.getByLabelText(/^Postcode/), 'ls1 5hd')
    await user.type(screen.getByLabelText(/^Their name/), 'Kofi Mensah')
    await choose(user, 'Who they are to you', 'Husband')
    await user.type(screen.getByLabelText('Their phone number'), '07898765432')
    await user.click(screen.getByRole('button', { name: 'Save and carry on' }))
    await waitFor(() => expect(state.refreshed).toBe(1))
    expect(state.addresses).toEqual([{ line1: '22 Park Row', line2: 'Flat 3', town: 'Leeds', postcode: 'LS1 5HD' }])
    expect(state.written.find((w) => w.table === 'profiles')!.row).toMatchObject({
      emergency_contact_name: 'Kofi Mensah',
      emergency_contact_relation: 'husband',
      emergency_contact_phone: '+447898765432',
      onboarded_at: '2026-01-05T09:00:00Z',
    })
  })

  /*
   * Everybody who gave a name and a number before 0302: the one thing they
   * are missing is who that person is, and the rest is as they left it.
   */
  it('asks somebody who gave a name and a number only who that person is to them', async () => {
    const user = userEvent.setup()
    state.emergency = { name: 'Ama Mensah', relation: null, phone: '+447812345678' }
    render(<JoiningPage completing />)
    const alert = await screen.findByRole('alert')
    await waitFor(() =>
      expect(within(alert).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Date of birth',
        'Emergency contact’s relationship to you',
      ]),
    )
    expect(screen.getByDisplayValue('Ama Mensah')).toBeInTheDocument()
    await pickDate(user, screen.getByLabelText('Date of birth'), '1990-04-12')
    await choose(user, 'Who they are to you', 'Mother')
    await user.click(screen.getByRole('button', { name: 'Save and carry on' }))
    await waitFor(() => expect(state.refreshed).toBe(1))
    expect(state.written.find((w) => w.table === 'profiles')!.row).toMatchObject({
      emergency_contact_name: 'Ama Mensah',
      emergency_contact_relation: 'mother',
      emergency_contact_phone: '+447812345678',
    })
  })

  /*
   * An answer from before the list was split (0305): "Husband or wife" was
   * an answer, and is kept as one. Nobody is asked again for it.
   */
  it('keeps an answer chosen when two people shared a word, shows it as chosen, and does not ask again', async () => {
    const user = userEvent.setup()
    state.emergency = { name: 'Kofi Mensah', relation: 'spouse', phone: '+447812345678' }
    render(<JoiningPage completing />)
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(within(alert).getAllByRole('button').map((b) => b.textContent)).toEqual(['Date of birth']))
    const picker = screen.getByRole('combobox', { name: 'Who they are to you' })
    expect(picker).toHaveTextContent('Husband or wife')
    // Their own answer is in the list, after the ones offered now, so it is not a blank.
    await user.click(picker)
    const offered = (await screen.findAllByRole('option')).map((o) => o.textContent)
    // (The list draws a tick beside whichever is chosen.)
    expect(offered.at(-1)).toMatch(/^Husband or wife/)
    expect(offered).toHaveLength(13)
    await user.keyboard('{Escape}')

    await pickDate(user, screen.getByLabelText('Date of birth'), '1990-04-12')
    await user.click(screen.getByRole('button', { name: 'Save and carry on' }))
    await waitFor(() => expect(state.refreshed).toBe(1))
    expect(state.written.find((w) => w.table === 'profiles')!.row).toMatchObject({ emergency_contact_relation: 'spouse' })
  })

  it('asks again for a relationship this app has never heard of, rather than keep a word it cannot show', async () => {
    state.emergency = { name: 'Ama Mensah', relation: 'godparent', phone: '+447812345678' }
    render(<JoiningPage completing />)
    const alert = await screen.findByRole('alert')
    await waitFor(() =>
      expect(within(alert).getByRole('button', { name: 'Emergency contact’s relationship to you' })).toBeInTheDocument(),
    )
  })
})

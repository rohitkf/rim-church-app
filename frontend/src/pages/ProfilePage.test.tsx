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
  /** Who to ring, as on the profile (0301). */
  emergency: {
    name: 'Ama Mensah' as string | null,
    relation: 'mother' as string | null,
    phone: '+447812345678' as string | null,
  },
  phone: null as string | null,
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
      phone: state.phone,
      dob: '1990-01-01',
      anniversary: null,
      marital_status: 'single',
      emergency_contact_name: state.emergency.name,
      emergency_contact_relation: state.emergency.relation,
      emergency_contact_phone: state.emergency.phone,
    },
    refreshProfile: () => {
      state.refreshed += 1
    },
  }),
}))

vi.mock('../components/FamilyCard', () => ({ FamilyCard: () => null }))

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
  state.emergency = { name: 'Ama Mensah', relation: 'mother', phone: '+447812345678' }
  state.phone = null
})

const profileSaves = () => state.updates.filter((u) => u.table === 'profiles').map((u) => u.row)

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

  it('saves a name the way a name is written, and shows it so once the box is left', async () => {
    const user = userEvent.setup()
    show()
    const first = screen.getByDisplayValue('Rohit')
    await user.clear(first)
    await user.type(first, 'rOHAN')
    await user.tab()
    expect(first).toHaveValue('Rohan')
    await waitFor(() => expect(profileSaves().at(-1)).toMatchObject({ first_name: 'Rohan' }), { timeout: 3000 })
  })

  it('does not save a name that is not one, and says what to take out', async () => {
    const user = userEvent.setup()
    show()
    const first = screen.getByDisplayValue('Rohit')
    await user.clear(first)
    await user.type(first, 'y@cht_234')
    expect(screen.getByText(/First name can only have letters in it\. Take out @, _, 2, 3 and 4\. Not saved yet\./)).toBeInTheDocument()
    expect(first).toHaveAttribute('aria-invalid', 'true')
    await new Promise((r) => setTimeout(r, 1300))
    expect(profileSaves()).toHaveLength(0)
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

/*
 * Who to ring in an emergency (0301): on the profile for everybody, and
 * never saved blank or wrong over a good answer.
 */
describe('who to ring in an emergency', () => {
  it('is on the profile, with what they gave', () => {
    show()
    expect(screen.getByRole('heading', { name: 'In an emergency' })).toBeInTheDocument()
    expect(screen.getByLabelText('Their name')).toHaveValue('Ama Mensah')
    expect(screen.getByLabelText('Their phone number')).toHaveValue('07812 345678')
    expect(screen.getByRole('combobox', { name: 'Who they are to you' })).toHaveTextContent('Mother')
    expect(screen.queryByText(/Not saved yet/)).toBeNull()
  })

  /*
   * Red, as Erase Data's card is (the Owner's ask): the one card on the
   * page about something going wrong, found at a glance.
   */
  it('is the red card on the page, and the only one', () => {
    show()
    const card = screen.getByRole('heading', { name: 'In an emergency' }).closest('section')!
    expect(card.className).toContain('--color-accent-red')
    const others = screen
      .getAllByRole('heading', { level: 2 })
      .filter((h) => h.textContent !== 'In an emergency')
      .map((h) => h.closest('section')!)
    expect(others.length).toBeGreaterThan(0)
    for (const other of others) expect(other.className).not.toContain('--color-accent-red')
  })

  it('saves who they are as soon as it is chosen', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('combobox', { name: 'Who they are to you' }))
    await user.click(await screen.findByRole('option', { name: 'Wife' }))
    await waitFor(
      () =>
        expect(profileSaves().at(-1)).toMatchObject({
          emergency_contact_name: 'Ama Mensah',
          emergency_contact_relation: 'wife',
          emergency_contact_phone: '+447812345678',
        }),
      { timeout: 3000 },
    )
  })

  /*
   * An answer from before the list was split (0305) is still an answer:
   * shown as chosen, saved as it is, and changeable for a closer one.
   */
  it('shows an answer chosen when two people shared a word, and waits for nothing', async () => {
    state.emergency = { name: 'Kofi Mensah', relation: 'sibling', phone: '+447812345678' }
    const user = userEvent.setup()
    show()
    expect(screen.getByRole('combobox', { name: 'Who they are to you' })).toHaveTextContent('Brother or sister')
    expect(screen.queryByText(/Not saved yet/)).toBeNull()
    await user.click(screen.getByRole('combobox', { name: 'Who they are to you' }))
    await user.click(await screen.findByRole('option', { name: 'Sister' }))
    await waitFor(() => expect(profileSaves().at(-1)).toMatchObject({ emergency_contact_relation: 'sister' }), { timeout: 3000 })
    // Once changed, the old word is not offered to go back to.
    await user.click(screen.getByRole('combobox', { name: 'Who they are to you' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).not.toContain('Brother or sister')
  })

  it('waits for who they are, for somebody who gave a name and a number before it was asked', async () => {
    state.emergency = { name: 'Ama Mensah', relation: null, phone: '+447812345678' }
    const user = userEvent.setup()
    show()
    expect(screen.getByText('Choose who they are to you. Not saved yet.')).toBeInTheDocument()
    // The rest of the profile goes on saving, and does not blank what is on record.
    const first = screen.getByDisplayValue('Rohit')
    await user.clear(first)
    await user.type(first, 'Rohan')
    await waitFor(() => expect(profileSaves().at(-1)).toMatchObject({ first_name: 'Rohan' }), { timeout: 3000 })
    expect(profileSaves().at(-1)).toMatchObject({ emergency_contact_name: 'Ama Mensah', emergency_contact_phone: '+447812345678' })
  })

  it('saves a changed name with the rest of the profile', async () => {
    const user = userEvent.setup()
    show()
    const name = screen.getByLabelText('Their name')
    await user.clear(name)
    await user.type(name, 'Kofi Mensah')
    await waitFor(
      () =>
        expect(profileSaves().at(-1)).toMatchObject({
          emergency_contact_name: 'Kofi Mensah',
          emergency_contact_relation: 'mother',
          emergency_contact_phone: '+447812345678',
        }),
      { timeout: 3000 },
    )
  })

  it('does not save a rubbed-out name over the one on record, and says it is waiting', async () => {
    const user = userEvent.setup()
    show()
    await user.clear(screen.getByLabelText('Their name'))
    // By its words: the toaster is a status region too.
    expect(screen.getByText('Enter their name: everybody needs somebody we can ring. Not saved yet.')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 1300))
    expect(profileSaves()).toHaveLength(0)
  })

  it('goes on saving the rest of the profile while it waits, with who to ring as it was', async () => {
    const user = userEvent.setup()
    show()
    await user.clear(screen.getByLabelText('Their name'))
    const first = screen.getByDisplayValue('Rohit')
    await user.clear(first)
    await user.type(first, 'Rohan')
    await waitFor(() => expect(profileSaves().at(-1)).toMatchObject({ first_name: 'Rohan' }), { timeout: 3000 })
    expect(profileSaves().at(-1)).toMatchObject({ emergency_contact_name: 'Ama Mensah', emergency_contact_phone: '+447812345678' })
  })

  it('will not take their own number', async () => {
    state.phone = '+447911123456'
    const user = userEvent.setup()
    show()
    const ring = screen.getByLabelText('Their phone number')
    await user.clear(ring)
    await user.type(ring, '07911123456')
    expect(screen.getByText(/That is your own number.*Not saved yet\./)).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 1300))
    expect(profileSaves()).toHaveLength(0)
  })

  it('says only they and the Owner see it', () => {
    show()
    expect(screen.getByText(/Somebody we can ring if something happens to you at church\. Only you and the Owner can see these\./)).toBeInTheDocument()
  })
})

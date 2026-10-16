import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from '../test/pickers'
import { JoiningPage } from './JoiningPage'

/*
 * The form somebody fills in on their way in. What matters is that it
 * cannot be got past without answering, and that the two questions which
 * depend on an earlier answer are asked only when they mean something.
 */

const state = vi.hoisted(() => ({
  written: [] as { table: string; row: Record<string, unknown> }[],
  refreshed: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    profile: {
      id: 'u1',
      first_name: 'Grace',
      last_name: 'Mensah',
      email: 'grace@example.com',
      phone: null,
      dob: null,
      anniversary: null,
      avatar_url: null,
    },
    refreshProfile: () => {
      state.refreshed += 1
      return Promise.resolve()
    },
  }),
}))

vi.mock('../components/AppMark', () => ({ AppMark: () => null }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
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

const finish = () => userEvent.click(screen.getByRole('button', { name: /Finish and go in/ }))

/** The app's own select: a combobox that opens a list of options. */
async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function fillTheBasics() {
  await userEvent.type(screen.getByLabelText('Phone'), '07912345678')
  await pickDate(userEvent.setup(), screen.getByLabelText('Date of birth'), '1990-04-02')
  await choose('Marital status', 'Single')
}

describe('joining', () => {
  it('greets somebody by the name they signed up with', () => {
    render(<JoiningPage />)
    expect(screen.getByText(/Welcome, Grace/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Grace')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Mensah')).toBeInTheDocument()
  })

  it('will not be finished while anything is unanswered', async () => {
    render(<JoiningPage />)
    await finish()

    expect(screen.getByText(/still to answer/)).toBeInTheDocument()
    expect(state.written).toHaveLength(0)
  })

  it('asks a married person for their anniversary, and nobody else', async () => {
    render(<JoiningPage />)
    expect(screen.queryByLabelText(/Wedding anniversary/)).toBeNull()

    await choose('Marital status', 'Married')
    expect(screen.getByLabelText(/Wedding anniversary/)).toBeInTheDocument()

    await choose('Marital status', 'Single')
    expect(screen.queryByLabelText(/Wedding anniversary/)).toBeNull()
  })

  /*
   * Asking a British citizen when their status expires is an app that has
   * not listened to the answer before it.
   */
  it('asks about an expiry only of somebody whose status runs out', async () => {
    render(<JoiningPage />)
    await choose('Your status in the UK', 'British citizen')
    expect(screen.queryByRole('group', { name: /expiry date/i })).toBeNull()

    await choose('Your status in the UK', 'Student visa')
    expect(screen.getByRole('group', { name: /expiry date/i })).toBeInTheDocument()
    // And the date itself only once they say there is one.
    expect(screen.queryByLabelText('Expiry date')).toBeNull()
  })

  it('writes both halves of the profile, and the stamp that lets them in', async () => {
    render(<JoiningPage />)
    await fillTheBasics()
    await choose('Your status in the UK', 'Dependant visa')

    const expiryQuestion = screen.getByRole('group', { name: /expiry date/i })
    await userEvent.click(within(expiryQuestion).getByRole('button', { name: 'Yes' }))
    await pickDate(userEvent.setup(), screen.getByLabelText('Visa expiry date'), '2027-08-19')

    await userEvent.type(screen.getByLabelText(/Comment/), 'Applied 3 Oct')

    const dbs = screen.getByRole('group', { name: /DBS/i })
    await userEvent.click(within(dbs).getByRole('button', { name: 'Yes' }))

    await finish()

    await waitFor(() => expect(state.written).toHaveLength(2))
    const profile = state.written.find((w) => w.table === 'profiles')!.row
    const sensitive = state.written.find((w) => w.table === 'profile_sensitive')!.row

    expect(profile).toMatchObject({
      first_name: 'Grace',
      phone: '+447912345678',
      dob: '1990-04-02',
      marital_status: 'single',
    })
    expect(profile.onboarded_at).toEqual(expect.any(String))
    expect(sensitive).toMatchObject({
      visa_type: 'dependant',
      visa_has_expiry: true,
      visa_expiry: '2027-08-19',
      has_dbs: true,
      visa_note: 'Applied 3 Oct',
    })
    // And the session is told, or the form would still be standing there.
    expect(state.refreshed).toBe(1)
  })

  it('says what it will save, and shows the age beside a date of birth', async () => {
    render(<JoiningPage />)
    await fillTheBasics()
    expect(screen.getByText(/We’ll save it as \+44 7912 345678/)).toBeInTheDocument()
    expect(screen.getByText(/You’re \d+ years old/)).toBeInTheDocument()
  })

  it('will not go in on a phone number that is not one', async () => {
    render(<JoiningPage />)
    await fillTheBasics()
    const phone = screen.getByLabelText('Phone')
    await userEvent.clear(phone)
    await userEvent.type(phone, '0770')
    await choose('Your status in the UK', 'British citizen')
    const dbs = screen.getByRole('group', { name: /DBS/i })
    await userEvent.click(within(dbs).getByRole('button', { name: 'No' }))
    await finish()
    expect(await screen.findByText('That looks too short.')).toBeInTheDocument()
    expect(state.written).toHaveLength(0)
  })

  it('takes the country from a number typed with its +code', async () => {
    render(<JoiningPage />)
    const phone = screen.getByLabelText('Phone')
    await userEvent.type(phone, '+919876543210')
    expect(screen.getByText(/We’ll save it as \+91 98765 43210/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveTextContent('India')
  })

  it('offers the visa note only once a status is chosen', async () => {
    render(<JoiningPage />)
    expect(screen.queryByLabelText(/Comment/)).toBeNull()
    await choose('Your status in the UK', 'Student visa')
    expect(screen.getByLabelText(/Comment/)).toBeInTheDocument()
  })

  it('marks every unanswered field in red once they try to go on', async () => {
    render(<JoiningPage />)
    await finish()
    const red = (el: HTMLElement) => el.className.includes('field-error')
    expect(red(screen.getByLabelText('Phone'))).toBe(true)
    expect(red(screen.getByRole('combobox', { name: 'Marital status' }))).toBe(true)
    expect(red(screen.getByRole('combobox', { name: 'Your status in the UK' }))).toBe(true)
    expect(red(screen.getByRole('group', { name: /DBS/i }))).toBe(true)
    // Answered ones are not.
    expect(red(screen.getByDisplayValue('Grace'))).toBe(false)
    expect(state.written).toHaveLength(0)
  })

  it('says what is wrong with a name, and will not go on', async () => {
    render(<JoiningPage />)
    const first = screen.getByDisplayValue('Grace')
    await userEvent.clear(first)
    await userEvent.type(first, 'Gr4ce')
    expect(screen.getByText(/Use letters only/)).toBeInTheDocument()
    expect(first.className).toContain('field-error')
  })
})

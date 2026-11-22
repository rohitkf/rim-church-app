import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { pickDate } from '../test/pickers'
import { DbsCard } from './DbsCard'
import { dbsAge } from '../lib/dbs'
import { todayIso } from '../lib/monthGrid'

/*
 * One's own DBS on the profile (0324): a yes is the certificate's details
 * and permission to check them, saved together by a button, and a no that
 * would throw details away asks first.
 */

const state = vi.hoisted(() => ({
  hasDbs: false,
  details: null as Record<string, unknown> | null,
  saved: [] as Record<string, unknown>[],
  updates: [] as { table: string; row: Record<string, unknown> }[],
  refuse: null as string | null,
}))

const SAVED = {
  kind: 'enhanced',
  certificate_number: '001234567890',
  surname: 'Owusu',
  issued_on: '2023-03-14',
  workforce: 'child',
  update_service: true,
  share_code: null,
  consented_at: '2026-11-20T10:00:00Z',
  consent_wording: 'I give the church permission.',
  verified_at: null as string | null,
  verified_by: null as string | null,
  verified_by_name: null as string | null,
  status_checked: false,
  certificate_seen: false,
  id_seen: false,
}

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', first_name: 'Grace', last_name: 'Mensah', dob: '1990-05-04' } }),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'dbs_of') {
        return Promise.resolve({
          data: { user_id: 'u1', first_name: 'Grace', last_name: 'Mensah', dob: '1990-05-04', has_dbs: state.hasDbs, details: state.details, log: [] },
          error: null,
        })
      }
      if (name === 'save_my_dbs') {
        if (state.refuse) return Promise.resolve({ data: null, error: { message: state.refuse, code: '22023' } })
        state.saved.push(args)
        state.hasDbs = true
        state.details = { ...SAVED, kind: args.p_kind, certificate_number: args.p_certificate, surname: args.p_surname, issued_on: args.p_issued_on }
      }
      return Promise.resolve({ data: null, error: null })
    },
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          state.updates.push({ table, row })
          if (row.has_dbs === false) {
            state.hasDbs = false
            state.details = null
          }
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DbsCard />
    </QueryClientProvider>,
  )
}

const question = () => screen.findByRole('group', { name: 'Do you have a valid DBS check?' })
const answer = async (user: ReturnType<typeof userEvent.setup>, word: 'Yes' | 'No') =>
  user.click(within(await question()).getByRole('button', { name: word }))

beforeEach(() => {
  state.hasDbs = false
  state.details = null
  state.saved = []
  state.updates = []
  state.refuse = null
})

describe('the DBS card on a profile', () => {
  it('asks nothing more of somebody who says no', async () => {
    show()
    expect(within(await question()).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save DBS details' })).toBeNull()
  })

  it('opens the questions on a yes, and saves nothing until the button is pressed', async () => {
    const user = userEvent.setup()
    show()
    await answer(user, 'Yes')
    expect(screen.getByRole('radiogroup', { name: 'Which DBS check is it?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save DBS details' })).toBeInTheDocument()
    expect(state.saved).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
    // Changing their mind before saving is not a save either.
    await answer(user, 'No')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(state.updates).toHaveLength(0)
  })

  it('says what is missing only once they try to save, and does not save without permission', async () => {
    const user = userEvent.setup()
    show()
    await answer(user, 'Yes')
    await user.click(screen.getByRole('radio', { name: 'Standard' }))
    expect(screen.queryByText('Enter the 12-digit certificate number.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save DBS details' }))
    expect(screen.getByText('Enter the 12-digit certificate number.')).toBeInTheDocument()
    expect(screen.getByText('Tick the box to give permission for the check.')).toBeInTheDocument()
    expect(state.saved).toHaveLength(0)
  })

  it('saves the details and the permission together, then shows them waiting to be checked', async () => {
    const user = userEvent.setup()
    show()
    await answer(user, 'Yes')
    await user.click(screen.getByRole('radio', { name: 'Enhanced' }))
    await user.type(screen.getByLabelText(/Certificate number/), '001234567890')
    await pickDate(user, within(document.getElementById('profile-dbs-issued')!).getByRole('button'), '2023-03-14')
    await user.click(screen.getByRole('radio', { name: 'Adults' }))
    await user.click(within(screen.getByRole('group', { name: 'Is it on the DBS Update Service?' })).getByRole('button', { name: 'No' }))
    await user.click(screen.getByRole('checkbox', { name: /I give the church permission/ }))
    await user.click(screen.getByRole('button', { name: 'Save DBS details' }))
    await waitFor(() =>
      expect(state.saved).toEqual([
        {
          p_kind: 'enhanced',
          p_certificate: '001234567890',
          p_surname: 'Mensah',
          p_issued_on: '2023-03-14',
          p_workforce: 'adult',
          p_update_service: false,
          p_share_code: null,
          p_consent: true,
        },
      ]),
    )
    expect(await screen.findByText('Waiting to be checked.')).toBeInTheDocument()
    expect(screen.getByText('001234567890')).toBeInTheDocument()
    expect(screen.getByText(`14 March 2023 · ${dbsAge('2023-03-14', todayIso())}`)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('says what the database said when it refuses', async () => {
    state.refuse = 'A DBS certificate number is 12 digits.'
    const user = userEvent.setup()
    show()
    await answer(user, 'Yes')
    await user.click(screen.getByRole('radio', { name: 'Basic' }))
    await user.type(screen.getByLabelText(/Share code/), 'AB12CD34')
    await pickDate(user, within(document.getElementById('profile-dbs-issued')!).getByRole('button'), '2024-06-01')
    await user.click(screen.getByRole('checkbox', { name: /I give the church permission/ }))
    await user.click(screen.getByRole('button', { name: 'Save DBS details' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // Still open, with what they typed.
    expect(screen.getByLabelText(/Share code/)).toHaveValue('AB12CD34')
  })

  it('shows a verified certificate as verified, by whom, and by looking at what', async () => {
    state.hasDbs = true
    state.details = { ...SAVED, verified_at: '2026-11-21T09:30:00Z', verified_by: 'u9', verified_by_name: 'Ps Damien Antony', status_checked: true, certificate_seen: true }
    show()
    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.getByText(/on 21 November 2026 by Ps Damien Antony: checked online, original certificate seen\./)).toBeInTheDocument()
    expect(screen.queryByText('Waiting to be checked.')).toBeNull()
  })

  it('opens saved details for changing with the permission box unticked, and warns that a change is checked again', async () => {
    state.hasDbs = true
    state.details = { ...SAVED, verified_at: '2026-11-21T09:30:00Z' }
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Change details' }))
    expect(screen.getByLabelText(/Certificate number/)).toHaveValue('001234567890')
    expect(screen.getByLabelText(/Surname on the certificate/)).toHaveValue('Owusu')
    expect(screen.getByRole('checkbox', { name: /I give the church permission/ })).not.toBeChecked()
    expect(screen.getByText(/Changing the certificate’s details means they are checked again/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(state.saved).toHaveLength(0)
  })

  it('asks before a no that would remove saved details, and removes nothing if they keep them', async () => {
    state.hasDbs = true
    state.details = { ...SAVED }
    const user = userEvent.setup()
    show()
    await screen.findByText('Waiting to be checked.')
    await answer(user, 'No')
    const ask = screen.getByRole('group', { name: 'Remove your DBS details' })
    expect(state.updates).toHaveLength(0)
    await user.click(within(ask).getByRole('button', { name: 'Keep them' }))
    expect(screen.queryByRole('group', { name: 'Remove your DBS details' })).toBeNull()
    expect(state.updates).toHaveLength(0)
    expect(screen.getByText('Waiting to be checked.')).toBeInTheDocument()
  })

  it('saves the no once they confirm it, and the details are gone', async () => {
    state.hasDbs = true
    state.details = { ...SAVED }
    const user = userEvent.setup()
    show()
    await screen.findByText('Waiting to be checked.')
    await answer(user, 'No')
    await user.click(screen.getByRole('button', { name: 'Remove my DBS details' }))
    await waitFor(() => expect(state.updates).toEqual([{ table: 'profile_sensitive', row: { has_dbs: false } }]))
    await waitFor(() => expect(screen.queryByText('Waiting to be checked.')).toBeNull())
  })

  it('opens the questions for a yes from before the details were asked for', async () => {
    state.hasDbs = true
    show()
    expect(await screen.findByRole('radiogroup', { name: 'Which DBS check is it?' })).toBeInTheDocument()
    expect(within(await question()).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true')
  })
})

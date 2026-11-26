import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DbsCheckDialog } from './DbsCheckDialog'
import { dbsAge } from '../lib/dbs'
import { todayIso } from '../lib/monthGrid'

/*
 * Somebody's DBS, for whoever checks it (0324): what a check needs on one
 * screen, what the checker did ticked by them, and their name put to it.
 */

const state = vi.hoisted(() => ({
  me: 'owner',
  /** Whether the person looking is the Owner (0325): the only one who may mark their own. */
  isOwner: false,
  hasDbs: true,
  details: null as Record<string, unknown> | null,
  log: [] as Record<string, unknown>[],
  calls: [] as { name: string; args: Record<string, unknown> }[],
  refuse: null as string | null,
}))

const DETAILS = {
  kind: 'enhanced',
  certificate_number: '001234567890',
  surname: 'Owusu',
  issued_on: '2023-03-14',
  workforce: 'both',
  update_service: true,
  share_code: null as string | null,
  consented_at: '2026-11-20T10:00:00Z',
  consent_wording: 'I give the church permission to use these details.',
  verified_at: null as string | null,
  verified_by: null as string | null,
  verified_by_name: null as string | null,
  status_checked: false,
  certificate_seen: false,
  id_seen: false,
  // The fingerprint of these details, as the database gives it (0335).
  seen: 'fp-1' as string | null,
}

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ profile: { id: state.me }, isSuperAdmin: state.isOwner }) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'dbs_of') {
        return Promise.resolve({
          data: { user_id: 'u1', first_name: 'Grace', last_name: 'Mensah', dob: '1990-05-04', has_dbs: state.hasDbs, details: state.details, log: state.log },
          error: null,
        })
      }
      state.calls.push({ name, args })
      if (state.refuse) return Promise.resolve({ data: null, error: { message: state.refuse, code: '42501' } })
      if (name === 'verify_dbs') {
        // The database's own rule (0335): the mark is for the details that were shown, or for none.
        if (args.p_seen !== state.details?.seen) {
          return Promise.resolve({ data: null, error: { code: 'P0001', message: 'These details were changed after you opened them. Look at them again before you mark them verified.' } })
        }
        state.details = {
          ...state.details,
          verified_at: '2026-11-22T12:00:00Z',
          verified_by: 'owner',
          verified_by_name: 'Rohit Owner',
          status_checked: args.p_status_checked,
          certificate_seen: args.p_certificate_seen,
          id_seen: args.p_id_seen,
        }
      }
      if (name === 'unverify_dbs') state.details = { ...state.details, verified_at: null, verified_by: null, verified_by_name: null }
      return Promise.resolve({ data: null, error: null })
    },
  },
}))

const GRACE = { id: 'u1', first_name: 'Grace', last_name: 'Mensah' }

function show(person = GRACE) {
  const closed = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DbsCheckDialog person={person} onClose={closed} />
    </QueryClientProvider>,
  )
  return closed
}

beforeEach(() => {
  state.me = 'owner'
  state.isOwner = false
  state.hasDbs = true
  state.details = { ...DETAILS }
  state.log = []
  state.calls = []
  state.refuse = null
})

describe('checking somebody’s DBS', () => {
  it('puts what a check needs on one screen: the number, the surname on it, the date of birth', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Grace Mensah’s DBS' })).toBeInTheDocument()
    expect(await screen.findByText('001234567890')).toBeInTheDocument()
    expect(screen.getByText('Owusu')).toBeInTheDocument()
    expect(screen.getByText('4 May 1990')).toBeInTheDocument()
    expect(screen.getByText('Enhanced')).toBeInTheDocument()
    expect(screen.getByText('Children and adults')).toBeInTheDocument()
    expect(screen.getByText(`14 March 2023 · ${dbsAge('2023-03-14', todayIso())}`)).toBeInTheDocument()
    expect(screen.getByText('Not checked yet.')).toBeInTheDocument()
  })

  it('shows when permission was given, and the words agreed to', async () => {
    show()
    expect(await screen.findByText('“I give the church permission to use these details.”')).toBeInTheDocument()
    expect(screen.getByText(/20 November 2026/)).toBeInTheDocument()
  })

  it('points a certificate on the Update Service at GOV.UK, after the original and ID have been seen', async () => {
    show()
    const link = await screen.findByRole('link', { name: 'DBS Update Service' })
    expect(link).toHaveAttribute('href', 'https://www.gov.uk/dbs-update-service')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/See the original certificate and Grace’s photo ID first/)).toBeInTheDocument()
  })

  it('says a certificate not on the Update Service cannot be checked online', async () => {
    state.details = { ...DETAILS, update_service: false }
    show()
    expect(await screen.findByText(/It is not on the Update Service, so it cannot be checked online/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'DBS Update Service' })).toBeNull()
  })

  it('shows a Basic check its share code, and nothing about a workforce', async () => {
    state.details = { ...DETAILS, kind: 'basic', certificate_number: null, workforce: null, update_service: null, share_code: 'AB12CD34' }
    show()
    expect(await screen.findByText('AB12CD34')).toBeInTheDocument()
    expect(screen.queryByText('Workforce')).toBeNull()
    expect(screen.queryByText('On the Update Service')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Seen the shared certificate online' })).toBeInTheDocument()
  })

  it('marks nothing when the details changed after they were opened, and shows what they are now', async () => {
    // The person saved a different certificate between the checker's reading and the checker's click.
    const user = userEvent.setup()
    show()
    expect(await screen.findByText('001234567890')).toBeInTheDocument()
    state.details = { ...state.details, certificate_number: '009999999999', seen: 'fp-2' }
    await user.click(screen.getByRole('checkbox', { name: 'Seen the original certificate' }))
    await user.click(screen.getByRole('button', { name: 'Mark as verified' }))

    expect(await screen.findByText(/These details were changed after you opened them/)).toBeInTheDocument()
    // The details on screen are the new ones, and what was ticked was about the old ones.
    expect(await screen.findByText('009999999999')).toBeInTheDocument()
    expect(screen.queryByText('001234567890')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Seen the original certificate' })).not.toBeChecked()
    expect(screen.queryByText('Verified')).toBeNull()

    // Looked at again, ticked again: the mark is for what is there now.
    await user.click(screen.getByRole('checkbox', { name: 'Seen the original certificate' }))
    await user.click(screen.getByRole('button', { name: 'Mark as verified' }))
    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(state.calls.at(-1)).toEqual({ name: 'verify_dbs', args: { p_person: 'u1', p_status_checked: false, p_certificate_seen: true, p_id_seen: false, p_seen: 'fp-2' } })
  })

  it('does not mark anything verified until something is ticked, and records what was', async () => {
    const user = userEvent.setup()
    show()
    const button = await screen.findByRole('button', { name: 'Mark as verified' })
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Seen the original certificate' }))
    await user.click(screen.getByRole('checkbox', { name: 'Seen their photo ID' }))
    expect(button).toBeEnabled()
    await user.click(button)
    await waitFor(() =>
      expect(state.calls).toEqual([
        { name: 'verify_dbs', args: { p_person: 'u1', p_status_checked: false, p_certificate_seen: true, p_id_seen: true, p_seen: 'fp-1' } },
      ]),
    )
    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.getByText(/by Rohit Owner: original certificate seen, photo ID seen\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as verified' })).toBeNull()
  })

  it('takes a check back', async () => {
    state.details = { ...DETAILS, verified_at: '2026-11-21T09:30:00Z', verified_by: 'owner', verified_by_name: 'Rohit Owner', certificate_seen: true }
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Take the check back' }))
    await waitFor(() => expect(state.calls).toEqual([{ name: 'unverify_dbs', args: { p_person: 'u1' } }]))
    expect(await screen.findByText('Not checked yet.')).toBeInTheDocument()
  })

  it('does not offer somebody their own to verify, and says who can', async () => {
    state.me = 'u1'
    show()
    expect(await screen.findByText(/Somebody else has to check your own DBS: the Owner, a Pastor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as verified' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  /*
   * The Owner's own (0325). Out of the box only the Owner checks anybody's,
   * so theirs could not be checked at all; there is nobody above them to
   * do it. The record carries their name against their own certificate.
   */
  it('lets the Owner mark their own verified, and says the record will show it', async () => {
    state.me = 'u1'
    state.isOwner = true
    const user = userEvent.setup()
    show()
    expect(await screen.findByText(/This is your own\. As the Owner you can mark it yourself/)).toBeInTheDocument()
    expect(screen.queryByText(/Somebody else has to check your own DBS/)).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Seen the original certificate' }))
    await user.click(screen.getByRole('button', { name: 'Mark as verified' }))
    await waitFor(() =>
      expect(state.calls).toEqual([
        { name: 'verify_dbs', args: { p_person: 'u1', p_status_checked: false, p_certificate_seen: true, p_id_seen: false, p_seen: 'fp-1' } },
      ]),
    )
    expect(await screen.findByText('Verified')).toBeInTheDocument()
  })

  it('lets the Owner take their own check back', async () => {
    state.me = 'u1'
    state.isOwner = true
    state.details = { ...DETAILS, verified_at: '2026-11-21T09:30:00Z', verified_by: 'u1', verified_by_name: 'Grace Mensah', certificate_seen: true }
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Take the check back' }))
    await waitFor(() => expect(state.calls).toEqual([{ name: 'unverify_dbs', args: { p_person: 'u1' } }]))
  })

  it('says what the database said when it refuses', async () => {
    state.refuse = 'You may not check DBS details.'
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('checkbox', { name: 'Seen the original certificate' }))
    await user.click(screen.getByRole('button', { name: 'Mark as verified' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Not checked yet.')).toBeInTheDocument()
  })

  it('says so plainly for somebody who says no, and for a yes with no details yet', async () => {
    state.hasDbs = false
    state.details = null
    show()
    expect(await screen.findByText('Grace says they do not have a DBS check.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as verified' })).toBeNull()
  })

  it('says a yes with nothing behind it is being asked for', async () => {
    state.details = null
    show()
    expect(await screen.findByText(/has not given its details yet/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('keeps the history: permission, the check, and by whom', async () => {
    state.log = [
      { at: '2026-11-21T09:30:00Z', event: 'verified', kind: 'enhanced', wording: 'checked online, original certificate seen', by_name: 'Rohit Owner' },
      { at: '2026-11-20T10:00:00Z', event: 'consent', kind: 'enhanced', wording: 'I give the church permission to use these details.', by_name: 'Grace Mensah' },
    ]
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByText('History'))
    const items = within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toMatch(/21 November 2026.*Marked verified by Rohit Owner: checked online, original certificate seen$/)
    expect(items[1]).toMatch(/20 November 2026.*Gave permission for the check$/)
  })

  it('closes', async () => {
    const user = userEvent.setup()
    const closed = show()
    await user.click(await screen.findByRole('button', { name: 'Done' }))
    expect(closed).toHaveBeenCalled()
  })
})

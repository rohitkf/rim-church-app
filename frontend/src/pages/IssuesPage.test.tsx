import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IssuesPage } from './IssuesPage'
import { issueWindow, mayDeleteIssue, mayMarkIssue, mayRaiseIssue, raisesIssuesAnyTime } from '../lib/issues'
import { chooseOption } from '../test/select'

const auth = vi.hoisted(() => ({
  session: { user: { id: 'me' } },
  isAdmin: false,
  ledDepartmentIds: [] as string[],
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const teams = vi.hoisted(() => ({ teamIds: ['media'], onATeam: true, settled: true }))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => teams }))

const settings = vi.hoisted(() => ({
  issues_raise_scope: 'team',
  issue_retention_days: 30,
  issue_open_minutes_before: 60,
  issue_close_minutes_after: 120,
}))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => settings }))

const HOUR = 3_600_000
const NOW = Date.parse('2026-10-04T11:00:00Z')
const dayFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = dayFromNow(0)

/*
 * When each service runs, relative to NOW: s1 is on, s2 starts in three
 * hours (opens for issues in two), s3 ended three hours ago (closed an hour
 * ago).
 */
const clock = vi.hoisted(() => ({
  bounds: {} as Record<string, { from: number; to: number }>,
}))
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({
    startsAt: (id: string) => (clock.bounds[id] ? new Date(clock.bounds[id].from).toISOString() : null),
    endsAt: (id: string) => clock.bounds[id]?.to ?? null,
    now: NOW,
  }),
}))

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'media', name: 'Media', color: '#a855f7' },
      { id: 'sound', name: 'Sound', color: '#ef4444' },
    ]),
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: today, service_type: 'English Service', created_at: '' },
      { id: 's2', date: today, service_type: 'Evening Service', created_at: '' },
      { id: 's3', date: today, service_type: 'Early Service', created_at: '' },
      { id: 's4', date: dayFromNow(7), service_type: 'Next Week Service', created_at: '' },
      { id: 's5', date: dayFromNow(14), service_type: 'Fortnight Service', created_at: '' },
    ]),
}))

const state = vi.hoisted(() => ({
  issues: [] as Record<string, unknown>[],
  rpc: [] as { name: string; args: Record<string, unknown> }[],
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.order = () => Promise.resolve({ data: state.issues, error: null })
      b.delete = () => b
      b.eq = () => Promise.resolve({ error: null })
      return b
    },
  },
}))

const issue = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  service_id: 's1',
  department_id: 'sound',
  title: 'Mic 2 crackles',
  details: 'Left side of the stage',
  raised_by: 'someone',
  raised_by_department_id: 'media',
  created_at: new Date().toISOString(),
  outcome: null,
  remarks: null,
  marked_at: null,
  marked_by: null,
  team: { id: 'sound', name: 'Sound', color: '#ef4444' },
  raiser_team: { id: 'media', name: 'Media', color: '#a855f7' },
  raiser: { first_name: 'Grace', last_name: 'Mensah' },
  marker: null,
  ...over,
})

function show(path = '/issues') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <IssuesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const card = (name: string) => screen.findByRole('region', { name })
const openCard = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const c = await card(name)
  await user.click(within(c).getByRole('button', { name: new RegExp(name) }))
  return c
}

beforeEach(() => {
  auth.isAdmin = false
  auth.ledDepartmentIds = []
  teams.teamIds = ['media']
  teams.onATeam = true
  settings.issues_raise_scope = 'team'
  state.issues = []
  state.rpc = []
  clock.bounds = {
    s1: { from: NOW - HOUR, to: NOW + HOUR },
    s2: { from: NOW + 3 * HOUR, to: NOW + 4 * HOUR },
    s3: { from: NOW - 5 * HOUR, to: NOW - 3 * HOUR },
  }
})

describe('the rules', () => {
  it('lets App settings decide who may raise one', () => {
    const member = { isAdmin: false, onATeam: true, leadsATeam: false }
    const churchMember = { isAdmin: false, onATeam: false, leadsATeam: false }
    expect(mayRaiseIssue('team', member)).toBe(true)
    expect(mayRaiseIssue('team', churchMember)).toBe(false)
    expect(mayRaiseIssue('everyone', churchMember)).toBe(true)
    expect(mayRaiseIssue('leads', member)).toBe(false)
    expect(mayRaiseIssue('leads', { ...member, leadsATeam: true })).toBe(true)
  })

  it('takes issues from an hour before a service until two hours after it ends', () => {
    const s = { issue_open_minutes_before: 60, issue_close_minutes_after: 120 }
    const from = NOW
    const to = NOW + 2 * HOUR
    expect(issueWindow(from, to, s, NOW - 61 * 60_000).state).toBe('before')
    expect(issueWindow(from, to, s, NOW - 59 * 60_000).state).toBe('open')
    expect(issueWindow(from, to, s, to + 119 * 60_000).state).toBe('open')
    expect(issueWindow(from, to, s, to + 121 * 60_000).state).toBe('closed')
    expect(issueWindow(null, null, s, NOW).state).toBe('unplanned')
  })

  it('frees an Admin or a Head of any team from the window', () => {
    expect(raisesIssuesAnyTime({ isAdmin: false, leadsATeam: false })).toBe(false)
    expect(raisesIssuesAnyTime({ isAdmin: false, leadsATeam: true })).toBe(true)
    expect(raisesIssuesAnyTime({ isAdmin: true, leadsATeam: false })).toBe(true)
  })

  it('lets only a Head of the team, or an Admin, give the verdict', () => {
    expect(mayMarkIssue({ department_id: 'sound' }, { isAdmin: false, ledTeamIds: ['media'] })).toBe(false)
    expect(mayMarkIssue({ department_id: 'sound' }, { isAdmin: false, ledTeamIds: ['sound'] })).toBe(true)
    expect(mayMarkIssue({ department_id: 'sound' }, { isAdmin: true, ledTeamIds: [] })).toBe(true)
  })

  it('stops the raiser deleting it once a Head has marked it', () => {
    const me = { isAdmin: false, myId: 'me' }
    expect(mayDeleteIssue({ raised_by: 'me', outcome: null }, me)).toBe(true)
    expect(mayDeleteIssue({ raised_by: 'me', outcome: 'persistent' }, me)).toBe(false)
    expect(mayDeleteIssue({ raised_by: 'me', outcome: 'resolved' }, { isAdmin: true, myId: 'x' })).toBe(true)
  })
})

describe('the Issues page', () => {
  it('keeps each service shut until it is opened', async () => {
    state.issues = [issue()]
    const user = show()
    const c = await card('English Service')
    expect(within(c).getByText('1 open · 0 marked')).toBeInTheDocument()
    expect(within(c).getByText('Mic 2 crackles')).not.toBeVisible()
    await user.click(within(c).getByRole('button', { name: /English Service/ }))
    expect(within(c).getByText('Mic 2 crackles')).toBeVisible()
    expect(within(c).getByText(/Raised by/)).toHaveTextContent('Raised by Grace Mensah · Media')
    expect(within(c).getByText('For Sound')).toBeInTheDocument()
  })

  it('raises one under the service it was seen at, as your own team', async () => {
    const user = show()
    const c = await openCard(user, 'English Service')
    await chooseOption(user, within(c).getByRole('combobox', { name: 'Team it is for' }), 'Sound')
    await user.type(within(c).getByPlaceholderText('Mic 2 crackles when it moves'), 'Projector will not wake')
    await user.click(within(c).getByRole('button', { name: 'Raise issue' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({
      name: 'raise_issue',
      args: { service: 's1', team: 'sound', title: 'Projector will not wake', details: null, as_team: 'media' },
    })
  })

  it('shows the fields before a service opens, shut until it does', async () => {
    const user = show()
    const c = await openCard(user, 'Evening Service')
    expect(within(c).getByText(/^Taking issues from/)).toBeInTheDocument()
    const form = within(c).getByRole('form', { name: 'Raise an issue' })
    expect(within(form).getByText(/^You can raise an issue here from/)).toBeInTheDocument()
    expect(within(form).getByPlaceholderText('Mic 2 crackles when it moves')).toBeDisabled()
    expect(within(form).getByRole('combobox', { name: 'Team it is for' })).toBeDisabled()
    expect(within(form).getByRole('button', { name: 'Raise issue' })).toBeDisabled()
  })

  it('lets a Head raise one before the window opens', async () => {
    auth.ledDepartmentIds = ['media']
    const user = show()
    const c = await openCard(user, 'Evening Service')
    const form = within(c).getByRole('form', { name: 'Raise an issue' })
    expect(within(form).getByText(/as a Head or Admin you can still raise one/)).toBeInTheDocument()
    expect(within(form).getByPlaceholderText('Mic 2 crackles when it moves')).toBeEnabled()
  })

  it('shows the next service day once today’s are over, and not the one after', async () => {
    const over = { from: NOW - 9 * HOUR, to: NOW - 8 * HOUR }
    clock.bounds = { s1: over, s2: over, s3: over }
    const user = show()
    const c = await openCard(user, 'Next Week Service')
    expect(screen.queryByRole('region', { name: 'Fortnight Service' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'English Service' })).not.toBeInTheDocument()
    const form = within(c).getByRole('form', { name: 'Raise an issue' })
    expect(within(form).getByText(/once the service has a running order/)).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Raise issue' })).toBeDisabled()
  })

  it('closes a service to new issues two hours after it ends', async () => {
    state.issues = [issue({ service_id: 's3' })]
    const user = show()
    const c = await openCard(user, 'Early Service')
    expect(within(c).getByText('Closed for new issues')).toBeInTheDocument()
    expect(within(c).queryByRole('form', { name: 'Raise an issue' })).not.toBeInTheDocument()
  })

  it('lets an Admin raise one after a service has closed', async () => {
    auth.isAdmin = true
    state.issues = [issue({ service_id: 's3' })]
    const user = show()
    const c = await openCard(user, 'Early Service')
    const form = within(c).getByRole('form', { name: 'Raise an issue' })
    expect(within(form).getByPlaceholderText('Mic 2 crackles when it moves')).toBeEnabled()
  })

  it('offers no verdict to somebody on the team who is not its Head', async () => {
    teams.teamIds = ['sound']
    state.issues = [issue()]
    const user = show()
    const c = await openCard(user, 'English Service')
    expect(within(c).queryByRole('button', { name: 'Mark' })).not.toBeInTheDocument()
  })

  it('lets the Head mark it persistent, with remarks', async () => {
    auth.ledDepartmentIds = ['sound']
    state.issues = [issue()]
    const user = show()
    const c = await openCard(user, 'English Service')
    await user.click(within(c).getByRole('button', { name: 'Mark' }))
    await user.click(within(c).getByRole('radio', { name: 'Persistent' }))
    await user.type(within(c).getByPlaceholderText(/Swapped the cable/), 'Cable is worn; ordering one')
    await user.click(within(c).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({
      name: 'mark_issue',
      args: { issue: 'i1', outcome: 'persistent', remarks: 'Cable is worn; ordering one' },
    })
  })

  it('shows the verdict, who gave it and their remarks', async () => {
    state.issues = [
      issue({
        outcome: 'not_resolved',
        remarks: 'Needs a new desk',
        marked_at: new Date().toISOString(),
        marked_by: 'h',
        marker: { first_name: 'Joel', last_name: 'Reji' },
      }),
    ]
    const user = show()
    const c = await openCard(user, 'English Service')
    expect(within(c).getByText('Not resolved')).toBeInTheDocument()
    expect(within(c).getByText(/Marked not resolved by/)).toHaveTextContent('Joel Reji')
    expect(within(c).getByText('Needs a new desk')).toBeInTheDocument()
  })

  it('stops the raiser deleting a marked issue', async () => {
    state.issues = [
      issue({ raised_by: 'me', outcome: 'resolved', marked_at: new Date().toISOString(), marked_by: 'h' }),
    ]
    const user = show()
    const c = await openCard(user, 'English Service')
    expect(within(c).queryByRole('button', { name: /Delete issue/ })).not.toBeInTheDocument()
  })

  it('lets an Admin delete a marked issue', async () => {
    auth.isAdmin = true
    state.issues = [issue({ outcome: 'resolved', marked_at: new Date().toISOString(), marked_by: 'h' })]
    const user = show()
    const c = await openCard(user, 'English Service')
    expect(within(c).getByRole('button', { name: /Delete issue/ })).toBeInTheDocument()
  })

  it('opens the service a notification points at', async () => {
    state.issues = [issue()]
    show('/issues?issue=i1')
    const c = await card('English Service')
    expect(within(c).getByText('Mic 2 crackles')).toBeVisible()
  })

  it('offers no way to raise one when App settings close it to Heads and Admins', async () => {
    settings.issues_raise_scope = 'leads'
    const user = show()
    const c = await openCard(user, 'English Service')
    expect(within(c).queryByRole('form', { name: 'Raise an issue' })).not.toBeInTheDocument()
  })
})

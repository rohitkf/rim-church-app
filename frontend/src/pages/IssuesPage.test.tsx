import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IssuesPage } from './IssuesPage'
import { mayRaiseIssue } from '../lib/issues'
import { chooseOption } from '../test/select'

const auth = vi.hoisted(() => ({
  session: { user: { id: 'me' } },
  isAdmin: false,
  ledDepartmentIds: [] as string[],
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const teams = vi.hoisted(() => ({ teamIds: ['media'], onATeam: true, settled: true }))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => teams }))

const settings = vi.hoisted(() => ({ issues_raise_scope: 'team', issue_retention_days: 30 }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => settings }))

const today = new Date().toISOString().slice(0, 10)
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'media', name: 'Media', color: '#a855f7' },
      { id: 'sound', name: 'Sound', color: '#ef4444' },
    ]),
  fetchServices: () => Promise.resolve([{ id: 's1', date: today, service_type: 'English Service', created_at: '' }]),
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
  resolved_at: null,
  resolved_by: null,
  service: { date: today, service_type: 'English Service' },
  team: { id: 'sound', name: 'Sound', color: '#ef4444' },
  raiser_team: { id: 'media', name: 'Media', color: '#a855f7' },
  raiser: { first_name: 'Grace', last_name: 'Mensah' },
  resolver: null,
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IssuesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  auth.isAdmin = false
  auth.ledDepartmentIds = []
  teams.teamIds = ['media']
  teams.onATeam = true
  settings.issues_raise_scope = 'team'
  state.issues = []
  state.rpc = []
})

describe('who may raise an issue', () => {
  it('follows App settings', () => {
    const member = { isAdmin: false, onATeam: true, leadsATeam: false }
    const churchMember = { isAdmin: false, onATeam: false, leadsATeam: false }
    expect(mayRaiseIssue('team', member)).toBe(true)
    expect(mayRaiseIssue('team', churchMember)).toBe(false)
    expect(mayRaiseIssue('everyone', churchMember)).toBe(true)
    expect(mayRaiseIssue('leads', member)).toBe(false)
    expect(mayRaiseIssue('leads', { ...member, leadsATeam: true })).toBe(true)
  })
})

describe('the Issues page', () => {
  it('shows who raised it and the team they are on, and the team it is for', async () => {
    state.issues = [issue()]
    show()
    expect(await screen.findByText('Mic 2 crackles')).toBeInTheDocument()
    expect(screen.getByText('For Sound')).toBeInTheDocument()
    expect(screen.getByText(/Raised by/)).toHaveTextContent('Raised by Grace Mensah · Media')
  })

  it('raises one against a service and a team, as your own team', async () => {
    const user = show()
    await screen.findByRole('form', { name: 'Raise an issue' })
    await chooseOption(user, screen.getByRole('combobox', { name: 'Team it is for' }), 'Sound')
    await user.type(screen.getByPlaceholderText('Mic 2 crackles when it moves'), 'Projector will not wake')
    await user.click(screen.getByRole('button', { name: 'Raise issue' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({
      name: 'raise_issue',
      args: { service: 's1', team: 'sound', title: 'Projector will not wake', details: null, as_team: 'media' },
    })
  })

  it('lets only the team it is for mark it done', async () => {
    state.issues = [issue()]
    show()
    await screen.findByText('Mic 2 crackles')
    // I am on Media; this is Sound's.
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument()
  })

  it('marks it done for somebody on the team, and shows who did', async () => {
    teams.teamIds = ['sound']
    state.issues = [issue()]
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Mark done' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({ name: 'resolve_issue', args: { issue: 'i1', done: true } })
  })

  it('files a resolved one under Resolved with the name of whoever did it', async () => {
    state.issues = [
      issue({
        resolved_at: new Date().toISOString(),
        resolved_by: 'r',
        resolver: { first_name: 'Joel', last_name: 'Reji' },
      }),
    ]
    const user = show()
    await screen.findByText(/Nothing open/)
    await user.click(screen.getByRole('button', { name: /Resolved/ }))
    const resolved = await screen.findByText('Mic 2 crackles')
    expect(resolved.closest('li')!).toHaveTextContent('Marked done by Joel Reji')
    expect(within(resolved.closest('li')!).getByText('Resolved')).toBeInTheDocument()
  })

  it('offers no form when App settings close raising to Heads and Admins', async () => {
    settings.issues_raise_scope = 'leads'
    show()
    await screen.findByText(/Nothing open/)
    expect(screen.queryByRole('form', { name: 'Raise an issue' })).not.toBeInTheDocument()
  })
})

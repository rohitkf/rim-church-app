import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentsPage } from './DepartmentsPage'

/*
 * The Teams page, as Overwatch has it (0187): every team on the list, and
 * none of the doors that are somebody else's — no asking to join, since it
 * already reads them all, and no answering other people's asks, which are
 * an Admin's or that team's head's.
 */

const state = vi.hoisted(() => ({
  isAdmin: false,
  isOverwatch: false,
  led: [] as string[],
  own: [] as string[],
  /** The grid's team.request_join for this person (0190). */
  mayAsk: true,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'me' } },
    isAdmin: state.isAdmin,
    isOverwatch: state.isOverwatch,
    seesAllTeams: state.isAdmin || state.isOverwatch,
    ledDepartmentIds: state.led,
  }),
}))
vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({ can: (cap: string) => cap === 'team.request_join' && state.mayAsk }),
}))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

const dept = (id: string, name: string) => ({
  id,
  name,
  handbook_url: null,
  color: null,
  is_service_flow: false,
  is_worship: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

vi.mock('../lib/queries', () => ({
  fetchDepartments: () => Promise.resolve([dept('media', 'Media'), dept('audio', 'Audio')]),
  fetchOwnMemberships: () =>
    Promise.resolve((state.own).map((department_id: string) => ({ department_id, member_type: 'core' }))),
  fetchTeamRosterKinds: (ids: string[]) =>
    Promise.resolve(
      [
        { department_id: 'media', member_type: 'core' },
        { department_id: 'media', member_type: 'core' },
        { department_id: 'media', member_type: 'guest' },
        { department_id: 'audio', member_type: 'core' },
      ].filter((r) => ids.includes(r.department_id)),
    ),
  fetchJoinRequests: () =>
    Promise.resolve([
      {
        id: 'req-1',
        user_id: 'someone',
        department_id: 'media',
        status: 'pending',
        note: null,
        created_at: '2026-01-01T00:00:00Z',
        responded_at: null,
        granted_type: null,
        requester: { id: 'someone', first_name: 'Asha', last_name: 'Mathew', avatar_url: null },
        department: { id: 'media', name: 'Media', color: null },
      },
    ]),
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DepartmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.isAdmin = false
  state.isOverwatch = false
  state.led = []
  state.own = []
  state.mayAsk = true
})

describe('the Teams page', () => {
  it('lists every team for Overwatch, with no asking to join and no asks to answer', async () => {
    state.isOverwatch = true
    show()
    expect(await screen.findByRole('heading', { name: 'Media' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request to join' })).not.toBeInTheDocument()
    expect(screen.queryByText('Asha Mathew')).not.toBeInTheDocument()
  })

  it('offers a Church Member the teams to ask to join, wherever the church opens the page to them', async () => {
    show()
    expect((await screen.findAllByRole('button', { name: 'Request to join' })).length).toBeGreaterThan(0)
  })

  it('offers nobody the teams to ask to join when the church’s grid says no', async () => {
    state.mayAsk = false
    show()
    // The page has loaded its teams: nobody on any of them yet.
    expect(await screen.findByText(/not on a team yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request to join' })).not.toBeInTheDocument()
  })

  it('puts an ask in front of the head of its team', async () => {
    state.led = ['media']
    state.own = ['media']
    show()
    expect(await screen.findByText('Asha Mathew')).toBeInTheDocument()
  })

  it('counts each team’s core members, guests and everybody', async () => {
    state.isOverwatch = true
    show()
    expect(await screen.findByLabelText('2 core, 1 guest, 3 in all')).toBeInTheDocument()
    expect(screen.getByLabelText('1 core, 0 guests, 1 in all')).toBeInTheDocument()
  })
})

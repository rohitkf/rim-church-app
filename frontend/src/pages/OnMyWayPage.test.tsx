import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ArrivalPerson, ArrivalTeam, TeamArrivals } from '../lib/onMyWay'

const mins = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

const state = vi.hoisted(() => ({
  arrivals: null as unknown,
  teamIds: [] as string[],
  viewAs: null as null | { as: string },
  opens: true,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, viewAs: state.viewAs }) }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ timezone: 'Europe/London', clock_in_on_my_way: true }) }))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => ({ teamIds: state.teamIds, onATeam: true, settled: true }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ canOpen: (path: string) => path === '/on-my-way' && state.opens, settled: true }) }))
vi.mock('../components/TeamMark', () => ({ TeamMark: () => <span /> }))
vi.mock('../components/Surface', async (original) => ({
  ...(await original<typeof import('../components/Surface')>()),
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}))
vi.mock('../lib/onMyWay', async (original) => ({
  ...(await original<typeof import('../lib/onMyWay')>()),
  fetchTeamArrivals: () => Promise.resolve(state.arrivals),
}))

import { OnMyWayPage } from './OnMyWayPage'

const person = (id: string, first: string, over: Partial<ArrivalPerson> = {}): ArrivalPerson => ({
  id,
  first_name: first,
  last_name: 'Test',
  on_rota: true,
  state: 'none',
  eta_at: null,
  said_at: null,
  ...over,
})
const team = (id: string, name: string, callIn: number, people: ArrivalPerson[], over: Partial<ArrivalTeam> = {}): ArrivalTeam => ({
  id,
  name,
  color: null,
  mine: false,
  on_duty: false,
  call_at: mins(callIn),
  people,
  ...over,
})
const arrivals = (over: Partial<TeamArrivals> = {}): TeamArrivals => ({
  on: true,
  on_date: '2026-11-29',
  due: false,
  first_call: null,
  closes_at: mins(300),
  clocked: false,
  word: null,
  eta_at: null,
  said_at: null,
  sees_all: true,
  teams: [
    team('t2', 'Worship', -5, [person('w1', 'Wendy', { state: 'here' }), person('w2', 'Will', { state: 'not_coming' })]),
    team('t1', 'Media', -20, [
      person('m1', 'Asha', { state: 'here' }),
      person('m2', 'Cara', { state: 'coming', eta_at: mins(15) }),
      person('m3', 'Ben'),
    ]),
  ],
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OnMyWayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.arrivals = arrivals()
  state.teamIds = []
  state.viewAs = null
  state.opens = true
})

describe('the On my way page', () => {
  it('shows every team, the earliest called first, with the day added up', async () => {
    show()
    expect(await screen.findByRole('heading', { level: 1, name: 'On my way' })).toBeInTheDocument()
    const lists = await screen.findAllByRole('list', { name: /: who is here$/ })
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual(['Media: who is here', 'Worship: who is here'])
    expect(screen.getByText('2 of 5 here · 1 on the way · 1 can’t make it · 1 no word')).toBeInTheDocument()
    expect(within(lists[0]).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Cara Testin 15 minAbout \d\d:\d\d$/),
      'Ben TestNo word',
      'Asha TestHere',
    ])
  })

  it('finds somebody across every team, and leaves out a team with nobody left', async () => {
    const user = show()
    await screen.findAllByRole('list', { name: /: who is here$/ })
    await user.type(screen.getByRole('searchbox', { name: 'Find somebody' }), 'wendi')
    expect(screen.getByText('1 person found')).toBeInTheDocument()
    expect(screen.getAllByRole('list', { name: /: who is here$/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Worship: who is here'])
    expect(screen.queryByText('Will Test')).toBeNull()
  })

  it('says so on a day with no team due in', async () => {
    state.arrivals = arrivals({ teams: [] })
    show()
    expect(await screen.findByText('No team is due in today.')).toBeInTheDocument()
  })

  it('says so when the church has switched it off', async () => {
    state.arrivals = arrivals({ on: false, teams: [] })
    show()
    expect(await screen.findByText('On my way is switched off.')).toBeInTheDocument()
    expect(screen.getByText('It is switched on in Settings › Clock In.')).toBeInTheDocument()
  })

  it('in a preview shows only what that standing would be given', async () => {
    // The Owner previewing as somebody on Worship whom the page is not open to: their own team, not every team.
    state.viewAs = { as: 'member' }
    state.teamIds = ['t2']
    state.opens = false
    show()
    const lists = await screen.findAllByRole('list', { name: /: who is here$/ })
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual(['Worship: who is here'])
  })

  it('shows nothing of other teams to somebody the database did not give every team', async () => {
    state.arrivals = arrivals({ sees_all: false, teams: [team('t1', 'Media', -20, [person('m1', 'Asha')], { mine: true })] })
    show()
    const lists = await screen.findAllByRole('list', { name: /: who is here$/ })
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual(['Media: who is here'])
  })
})

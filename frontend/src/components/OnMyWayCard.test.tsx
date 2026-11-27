import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ArrivalPerson, Say, TeamArrivals } from '../lib/onMyWay'
import type { Estimate } from '../lib/onMyWayEstimate'

const mins = (n: number) => new Date(Date.now() + n * 60_000).toISOString()

const state = vi.hoisted(() => ({
  arrivals: null as unknown,
  said: [] as unknown[],
  sayFails: false,
  estimate: { at: 'unknown' } as unknown,
  teamIds: ['t1'] as string[],
  viewAs: null as null | { as: string },
  seesClockIn: false,
  on: true,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, viewAs: state.viewAs }) }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ timezone: 'Europe/London', clock_in_on_my_way: state.on }) }))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => ({ teamIds: state.teamIds, onATeam: true, settled: true }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ canOpen: (path: string) => path === '/clock-in' && state.seesClockIn, settled: true }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('./TeamMark', () => ({ TeamMark: () => <span data-testid="team-mark" /> }))
vi.mock('../lib/onMyWay', async (original) => ({
  ...(await original<typeof import('../lib/onMyWay')>()),
  fetchTeamArrivals: () => Promise.resolve(state.arrivals),
  sayOnMyWay: (what: Say) => {
    state.said.push(what)
    return state.sayFails ? Promise.reject(new Error('no')) : Promise.resolve()
  },
}))
vi.mock('../lib/onMyWayEstimate', async (original) => ({
  ...(await original<typeof import('../lib/onMyWayEstimate')>()),
  estimateFromHere: () => Promise.resolve(state.estimate),
}))

import { OnMyWayCard } from './OnMyWayCard'

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

/** Media was called ten minutes ago; four people, one of them me. */
const arrivals = (over: Partial<TeamArrivals> = {}): TeamArrivals => ({
  on: true,
  on_date: '2026-11-29',
  due: true,
  first_call: mins(-10),
  closes_at: mins(300),
  clocked: false,
  word: null,
  eta_at: null,
  said_at: null,
  sees_all: false,
  teams: [
    {
      id: 't1',
      name: 'Media',
      color: '#a855f7',
      mine: true,
      on_duty: true,
      call_at: mins(-10),
      people: [
        person('a', 'Asha', { state: 'here' }),
        person('me', 'Rohit'),
        person('c', 'Cara', { state: 'coming', eta_at: mins(20), said_at: mins(-2) }),
        person('e', 'Esi', { state: 'not_coming', said_at: mins(-30) }),
      ],
    },
  ],
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <OnMyWayCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.arrivals = arrivals()
  state.said = []
  state.sayFails = false
  state.estimate = { at: 'unknown' } satisfies Estimate
  state.teamIds = ['t1']
  state.viewAs = null
  state.seesClockIn = false
  state.on = true
})

describe('who is here, on the Dashboard', () => {
  it('lists a team name by name: who is still to come first, who is here last', async () => {
    show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(card).toHaveTextContent('1 of 4 in so far')
    const rows = within(within(card).getByRole('list', { name: 'Media: who is here' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Cara Testin 20 minAbout \d\d:\d\d$/),
      'Rohit Test (you)No word',
      'Esi TestCan’t make it',
      'Asha TestHere',
    ])
    expect(card).toHaveTextContent(/Mediacalled \d\d:\d\d/)
    expect(card).toHaveTextContent('1 of 4 here · 1 on the way')
  })

  it('gives "here" no time: when somebody arrived is the Clock In page’s', async () => {
    show()
    const row = (await screen.findByText('Asha Test')).closest('li')!
    expect(row.textContent).toBe('Asha TestHere')
  })

  it.each([
    ['the church has switched it off', () => (state.on = false)],
    ['there is no team to show', () => (state.arrivals = arrivals({ teams: [] }))],
    ['the first call is more than two hours off', () => (state.arrivals = arrivals({ teams: [{ ...arrivals().teams[0], call_at: mins(130) }] }))],
    ['the day’s services have ended', () => (state.arrivals = arrivals({ closes_at: mins(-1) }))],
  ])('is not drawn when %s', async (_why, arrange) => {
    arrange()
    show()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('region', { name: 'Who is here' })).toBeNull()
  })
})

describe('saying "On my way"', () => {
  it('asks how long, says what the team will see, and sends the minutes: nothing about where', async () => {
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(card).toHaveTextContent('Not there yet? Tell your team when you will be.')
    await user.click(within(card).getByRole('button', { name: 'On my way' }))
    const choices = within(card).getByRole('radiogroup', { name: 'How long will you be?' })
    expect(within(choices).getAllByRole('radio').map((r) => r.textContent)).toEqual(['5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '60 min'])
    // Nothing is sent until a time is chosen.
    expect(within(card).getByRole('button', { name: 'Tell my team' })).toBeDisabled()
    expect(card).toHaveTextContent('Your phone is read once. Only the time is sent, never where you are.')
    await user.click(within(choices).getByRole('radio', { name: '20 min' }))
    expect(card).toHaveTextContent(/Your team will see: about \d\d:\d\d\./)
    await user.click(within(card).getByRole('button', { name: 'Tell my team' }))
    await waitFor(() => expect(state.said).toEqual([{ word: 'coming', minutes: 20, how: 'chosen' }]))
    expect(JSON.stringify(state.said)).not.toMatch(/lat|lng|distance/)
  })

  it('works the time out from where the phone is, as a choice among the others that can be changed', async () => {
    state.estimate = { at: 'away', distanceM: 14_000, minutes: 35 } satisfies Estimate
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    await user.click(within(card).getByRole('button', { name: 'On my way' }))
    await user.click(within(card).getByRole('button', { name: 'Work it out from where I am' }))
    expect(await within(card).findByText('About 14 km away: roughly 35 minutes. Change it if you know better.')).toBeInTheDocument()
    expect(within(card).getByRole('radio', { name: '35 min' })).toBeChecked()
    await user.click(within(card).getByRole('button', { name: 'Tell my team' }))
    await waitFor(() => expect(state.said).toEqual([{ word: 'coming', minutes: 35, how: 'estimate' }]))
  })

  it('counts a number they changed as chosen, not estimated', async () => {
    state.estimate = { at: 'away', distanceM: 14_000, minutes: 35 } satisfies Estimate
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    await user.click(within(card).getByRole('button', { name: 'On my way' }))
    await user.click(within(card).getByRole('button', { name: 'Work it out from where I am' }))
    await within(card).findByRole('radio', { name: '35 min' })
    await user.click(within(card).getByRole('radio', { name: '45 min' }))
    await user.click(within(card).getByRole('button', { name: 'Tell my team' }))
    await waitFor(() => expect(state.said).toEqual([{ word: 'coming', minutes: 45, how: 'chosen' }]))
  })

  it.each([
    [{ at: 'church' } satisfies Estimate, 'You are at church already. Press Clock in.'],
    [{ at: 'blocked' } satisfies Estimate, 'Location is blocked for this app, so choose a time.'],
    [{ at: 'unknown' } satisfies Estimate, 'Your phone could not say where it is, so choose a time.'],
  ])('says so and chooses nothing for them when the phone answers %j', async (estimate, words) => {
    state.estimate = estimate
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    await user.click(within(card).getByRole('button', { name: 'On my way' }))
    await user.click(within(card).getByRole('button', { name: 'Work it out from where I am' }))
    expect(await within(card).findByText(words)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Tell my team' })).toBeDisabled()
    expect(within(card).queryAllByRole('radio', { checked: true })).toEqual([])
  })

  it('asks before saying they cannot make it, because their Head is told', async () => {
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    await user.click(within(card).getByRole('button', { name: 'Can’t make it' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Tell your team you can’t make it?' })
    expect(dialog).toHaveTextContent('its Head is told straight away')
    expect(state.said).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Tell them' }))
    await waitFor(() => expect(state.said).toEqual([{ word: 'not_coming' }]))
  })

  it('shows what they said, and lets them change it', async () => {
    state.arrivals = arrivals({ word: 'coming', eta_at: mins(25), said_at: mins(-1) })
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(card).toHaveTextContent(/You told your team: about \d\d:\d\d\./)
    expect(within(card).queryByRole('button', { name: 'On my way' })).toBeNull()
    await user.click(within(card).getByRole('button', { name: 'Change' }))
    expect(within(card).getByRole('radiogroup', { name: 'How long will you be?' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Can’t make it' })).toBeInTheDocument()
  })

  it('says so, having said they cannot make it, and offers the way back', async () => {
    state.arrivals = arrivals({ word: 'not_coming', said_at: mins(-1) })
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(card).toHaveTextContent('You told your team you can’t make it.')
    await user.click(within(card).getByRole('button', { name: 'Change' }))
    // Coming after all is a time; "can't make it" is already said.
    expect(within(card).queryByRole('button', { name: 'Can’t make it' })).toBeNull()
    await user.click(within(card).getByRole('radio', { name: '30 min' }))
    await user.click(within(card).getByRole('button', { name: 'Tell my team' }))
    await waitFor(() => expect(state.said).toEqual([{ word: 'coming', minutes: 30, how: 'chosen' }]))
  })

  it.each([
    ['they have clocked in', { clocked: true }],
    ['they are not due in today', { due: false }],
  ])('offers nothing to say when %s, and still shows the team', async (_why, over) => {
    state.arrivals = arrivals(over)
    show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(within(card).queryByRole('button', { name: 'On my way' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Can’t make it' })).toBeNull()
    expect(within(card).getByRole('list', { name: 'Media: who is here' })).toBeInTheDocument()
  })

  it('says when it could not be sent, and keeps the choice', async () => {
    state.sayFails = true
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    await user.click(within(card).getByRole('button', { name: 'On my way' }))
    await user.click(within(card).getByRole('radio', { name: '10 min' }))
    await user.click(within(card).getByRole('button', { name: 'Tell my team' }))
    expect(await within(card).findByRole('alert')).toHaveTextContent('Could not tell your team. Try again.')
    expect(within(card).getByRole('radio', { name: '10 min' })).toBeChecked()
  })
})

describe('whose teams', () => {
  const worship = { id: 't2', name: 'Worship', color: null, mine: false, on_duty: false, call_at: mins(-5), people: [person('w', 'Wendy')] }

  it('shows every team to whoever sees the Clock In page: their own open, the rest a tap away', async () => {
    state.seesClockIn = true
    state.arrivals = arrivals({ sees_all: true, teams: [...arrivals().teams, worship] })
    const user = show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(within(card).getByRole('list', { name: 'Media: who is here' })).toBeInTheDocument()
    expect(within(card).queryByRole('list', { name: 'Worship: who is here' })).toBeNull()
    expect(card).toHaveTextContent('0 of 1 here')
    await user.click(within(card).getByRole('button', { name: 'Show Worship' }))
    expect(within(within(card).getByRole('list', { name: 'Worship: who is here' })).getByText('Wendy Test')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Hide Worship' }))
    expect(within(card).queryByRole('list', { name: 'Worship: who is here' })).toBeNull()
  })

  it('in a preview shows what that standing would be given, not the previewer’s own answer', async () => {
    // The Owner, who sees every team, previewing as a Church Member: no teams, so no card.
    state.arrivals = arrivals({ sees_all: true, teams: [...arrivals().teams, worship] })
    state.viewAs = { as: 'member' }
    state.teamIds = []
    state.seesClockIn = false
    show()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('region', { name: 'Who is here' })).toBeNull()
  })

  it('in a preview as somebody on Worship shows Worship, and not the previewer’s own Media', async () => {
    state.arrivals = arrivals({ sees_all: true, teams: [...arrivals().teams, worship] })
    state.viewAs = { as: 'team_member' }
    state.teamIds = ['t2']
    state.seesClockIn = false
    show()
    const card = await screen.findByRole('region', { name: 'Who is here' })
    expect(within(card).getByRole('list', { name: 'Worship: who is here' })).toBeInTheDocument()
    expect(card).not.toHaveTextContent('Media')
  })
})

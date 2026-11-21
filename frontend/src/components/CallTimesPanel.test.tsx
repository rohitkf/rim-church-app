import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CallTimesPanel } from './CallTimesPanel'
import { DEFAULT_CALL_TIME } from '../lib/callTimes'
import { pickTime } from '../test/pickers'

const SUNDAY = '2026-09-06'

const state = vi.hoisted(() => ({
  rows: [] as { department_id: string; on_date: string; call_time: string }[],
  writes: [] as { kind: string; payload: unknown }[],
  rpc: [] as { fn: string; args: unknown }[],
  /** What the database says to the next write, when it says no. */
  refuse: null as string | null,
}))

vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'gradient' }) }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.rpc.push({ fn, args })
      return Promise.resolve({ data: 4, error: null })
    },
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: state.rows, error: null }),
      }),
      upsert: (payload: unknown) => {
        if (state.refuse) return Promise.resolve({ error: { code: '42501', message: state.refuse } })
        state.writes.push({ kind: 'upsert', payload })
        return Promise.resolve({ error: null })
      },
      delete: () => ({
        eq: () => ({
          eq: () => {
            state.writes.push({ kind: 'delete', payload: null })
            return Promise.resolve({ error: null })
          },
        }),
      }),
    }),
  },
}))

/* The real case: two services on one Sunday, one call time between them. */
const DAYS = [
  {
    date: SUNDAY,
    services: [
      { id: 's1', date: SUNDAY, service_type: 'English Service' },
      { id: 's2', date: SUNDAY, service_type: 'Malayalam Service' },
    ],
  },
  {
    date: '2026-09-13',
    services: [{ id: 's3', date: '2026-09-13', service_type: 'English Service' }],
  },
]

const TEAMS = [
  { id: 'media', name: 'Media', color: '#3b82f6' },
  { id: 'worship', name: 'Worship', color: '#22c55e' },
  { id: 'ushers', name: 'Ushers', color: '#f59e0b' },
]

function show({ mine = [] as string[], manages = [] as string[], all = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CallTimesPanel
        days={DAYS}
        teams={TEAMS}
        myTeamIds={new Set(mine)}
        canManage={(id) => manages.includes(id)}
        canManageAll={all}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The rest of the church's teams, folded under yours. */
const openPanel = async (user: ReturnType<typeof show>) => {
  await user.click(screen.getByRole('button', { name: /^(Other|Every) team/ }))
}

const tileFor = (name: string) => screen.getByText(name).closest('li')!

/*
 * The night before.
 *
 * A countdown only runs towards a moment that has not come, so this file
 * used to pass until the real clock reached its own fixture date — 6
 * September 2026 — and then failed for nobody's mistake. It stands at
 * eight the evening before now, which is a fixed distance from every call
 * time in here.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-09-05T20:00:00'))
  state.rows = [
    { department_id: 'media', on_date: SUNDAY, call_time: '08:30:00' },
    { department_id: 'worship', on_date: SUNDAY, call_time: '08:00:00' },
  ]
  state.writes = []
  state.refuse = null
})

afterEach(() => vi.useRealTimers())

describe('the call times panel', () => {
  it('shows your own teams straight away, and folds the rest of the church’s', async () => {
    // The rota underneath is what the page is for; your call time is the
    // one thing on here you came for, and everybody else's is a tap away.
    show({ mine: ['media'] })
    expect(await within(screen.getByRole('list', { name: 'Your teams' })).findByText('Media')).toBeInTheDocument()
    expect(within(tileFor('Media')).getByText(/until your call/)).toBeInTheDocument()
    expect(screen.queryByText('Worship')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Other teams/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('folds every team when you are on none of them', () => {
    show()
    expect(screen.queryByText('Media')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Every team/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens on the next day, and shows every team, not only yours', async () => {
    const user = show({ mine: ['media'] })
    await openPanel(user)
    await screen.findByText('Media')
    for (const name of ['Media', 'Worship', 'Ushers']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('gives a team nobody has set the seven o’clock default, and says so', async () => {
    const user = show()
    await openPanel(user)
    const ushers = await waitFor(() => tileFor('Ushers'))
    expect(
      within(ushers).getByText(new RegExp(`The usual ${DEFAULT_CALL_TIME}`)),
    ).toBeInTheDocument()
  })

  it('names the day’s services rather than asking you to pick one', async () => {
    // One arrival covers the whole morning, so the services are context.
    show()
    expect(screen.getByText(/English Service · Malayalam Service/)).toBeInTheDocument()
  })

  it('does not call a set time a default, even when it is seven', async () => {
    // "We have not decided" and "we decided seven" are different facts.
    state.rows = [
      { department_id: 'ushers', on_date: SUNDAY, call_time: `${DEFAULT_CALL_TIME}:00` },
    ]
    const user = show()
    await openPanel(user)
    const ushers = await waitFor(() => tileFor('Ushers'))
    expect(within(ushers).queryByText(/The usual/)).not.toBeInTheDocument()
  })

  it('counts down only your own team', async () => {
    // Eight running clocks is a claim on your attention nobody can honour.
    const user = show({ mine: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    expect(within(tileFor('Media')).getByText(/until your call/)).toBeInTheDocument()
    expect(within(tileFor('Worship')).queryByText(/until your call/)).not.toBeInTheDocument()
  })

  it('reads your own team first', async () => {
    // Worship is called earliest, Ushers is yours, so Ushers reads first.
    const user = show({ mine: ['ushers'] })
    await openPanel(user)
    await waitFor(() => tileFor('Ushers'))
    const first = screen.getAllByRole('listitem')[0]
    expect(within(first).getByText('Ushers')).toBeInTheDocument()
  })

  it('offers no setter to somebody who does not run the team', async () => {
    const user = show({ mine: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    expect(screen.queryByLabelText('Call time for Media')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('lets a head set their own team’s time, and nobody else’s', async () => {
    const user = show({ manages: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    expect(screen.getByLabelText('Call time for Media')).toBeInTheDocument()
    expect(screen.queryByLabelText('Call time for Worship')).not.toBeInTheDocument()
  })

  it('saves only on a deliberate press, not on every keystroke', async () => {
    // A bare input that wrote as you typed would save 03:00 on the way to
    // 03:30, and a whole team reads this.
    const user = show({ manages: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    await pickTime(user, screen.getByLabelText('Call time for Media'), '09:15')
    expect(state.writes).toHaveLength(0)

    await user.click(within(tileFor('Media')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].kind).toBe('upsert')
  })

  it('will not save a time that has not changed', async () => {
    const user = show({ manages: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    expect(within(tileFor('Media')).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('puts a team back on the default rather than leaving it blank', async () => {
    const user = show({ manages: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    await user.click(
      within(tileFor('Media')).getByRole('button', { name: `Back to ${DEFAULT_CALL_TIME}` }),
    )
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].kind).toBe('delete')
  })

  it('offers no “back to the default” on a team already on it', async () => {
    const user = show({ manages: ['ushers'] })
    await openPanel(user)
    await waitFor(() => tileFor('Ushers'))
    expect(
      within(tileFor('Ushers')).queryByRole('button', { name: /Back to/ }),
    ).not.toBeInTheDocument()
  })

  it('lets a head reach a later day, so next Sunday can be set too', async () => {
    const user = show({ manages: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    expect(screen.getByRole('combobox', { name: 'Which day' })).toBeInTheDocument()
  })

  it('writes the call time against the day, not against a service', async () => {
    // Two services that Sunday; the team comes in once.
    const user = show({ manages: ['media'] })
    await openPanel(user)
    await waitFor(() => tileFor('Media'))
    await pickTime(user, screen.getByLabelText('Call time for Media'), '09:15')
    await user.click(within(tileFor('Media')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].payload).toMatchObject({
      on_date: SUNDAY,
      department_id: 'media',
      call_time: '09:15',
    })
  })

  it('says nothing at all when there is no day to be called to', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <CallTimesPanel days={[]} teams={TEAMS} myTeamIds={new Set()} canManage={() => true} />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('reminding a team of its call time (0224)', () => {
  beforeEach(() => {
    state.rpc = []
    state.rows = []
  })

  it('lets whoever runs a team remind everyone on it, for the day shown', async () => {
    const user = show({ mine: ['media'], manages: ['media'] })
    await user.click(await screen.findByRole('button', { name: 'Remind everyone on Media of their call time' }))
    await waitFor(() => expect(state.rpc).toEqual([{ fn: 'remind_call_times', args: { dept: 'media', d: SUNDAY } }]))
    expect(await screen.findByText('Reminded 4 people')).toBeInTheDocument()
    // Only their own team: nothing for a team they do not run, nor for every team.
    expect(screen.queryByRole('button', { name: /Remind everyone on Worship/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remind every team/ })).toBeNull()
  })

  it('lets the Owner and Admins remind every team at once', async () => {
    const user = show({ manages: ['media', 'worship', 'ushers'], all: true })
    await user.click(await screen.findByRole('button', { name: 'Remind every team of its call time' }))
    await waitFor(() => expect(state.rpc).toEqual([{ fn: 'remind_call_times', args: { dept: null, d: SUNDAY } }]))
  })

  it('offers nobody else a Remind', async () => {
    show({ mine: ['media'] })
    await screen.findByText('Media')
    expect(screen.queryByRole('button', { name: /Remind/ })).toBeNull()
  })
})

/*
 * Every team's call time, set at once: the Owner asked for it, having set
 * nine teams to the same time one box at a time.
 */
describe('setting every team’s call time at once', () => {
  const group = () => screen.queryByRole('group', { name: 'Every team at once' })
  const setAll = () => within(group()!).getByRole('button', { name: 'Set for every team' })

  it('is there for whoever may set every team’s, and for nobody else', async () => {
    const one = show({ manages: ['media'] })
    await openPanel(one)
    await screen.findByText('Media')
    expect(group()).toBeNull()
  })

  it('says what pressing it would do before it is pressed', async () => {
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    // Media is at 08:30, Worship at 08:00, Ushers on the usual 07:00: at 07:00 two would change.
    await waitFor(() => expect(group()).toHaveTextContent('2 of 3 teams change to 07:00; the rest are already due then.'))
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '09:15')
    expect(group()).toHaveTextContent('All 3 teams change to 09:15.')
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '08:30')
    expect(group()).toHaveTextContent('2 of 3 teams change to 08:30; the rest are already due then.')
  })

  it('asks first, naming the day and how many teams are told, and writes nothing until yes', async () => {
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '09:15')
    await user.click(setAll())
    const asking = within(screen.getByRole('alertdialog', { name: 'Set every team’s call time to 09:15?' }))
    // The day, as this device writes dates.
    expect(asking.getByText(/Sunday.*September/)).toBeInTheDocument()
    expect(asking.getByText(/3 teams change, and everybody on them is told the new time\./)).toBeInTheDocument()
    expect(state.writes).toEqual([])
    await user.click(asking.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(state.writes).toEqual([])
  })

  it('writes every team in one go, and says how many it came to', async () => {
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '09:15')
    await user.click(setAll())
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Set for every team' }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].kind).toBe('upsert')
    expect(state.writes[0].payload).toEqual([
      { on_date: SUNDAY, department_id: 'media', call_time: '09:15' },
      { on_date: SUNDAY, department_id: 'worship', call_time: '09:15' },
      { on_date: SUNDAY, department_id: 'ushers', call_time: '09:15' },
    ])
    expect(await within(group()!).findByRole('status')).toHaveTextContent('3 teams are now due at 09:15.')
  })

  it('leaves alone a team already due then, so its people are told of nothing', async () => {
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '08:30')
    await user.click(setAll())
    const asking = within(screen.getByRole('alertdialog'))
    expect(asking.getByText(/2 teams change.*1 team is already due then and stays as it is\./)).toBeInTheDocument()
    await user.click(asking.getByRole('button', { name: 'Set for every team' }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    // Media was at 08:30 already.
    expect((state.writes[0].payload as { department_id: string }[]).map((r) => r.department_id)).toEqual(['worship', 'ushers'])
  })

  it('has nothing to press when every team is due then already', async () => {
    state.rows = []
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    // Nobody has set one: all three are on the usual time, which is what the box starts at.
    await waitFor(() => expect(group()).toHaveTextContent(`Every team is already due at ${DEFAULT_CALL_TIME}.`))
    expect(setAll()).toBeDisabled()
  })

  it('says so when the database refuses, and claims nothing', async () => {
    state.refuse = 'new row violates row-level security policy for table "department_call_times"'
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '09:15')
    await user.click(setAll())
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Set for every team' }))
    await waitFor(() => expect(screen.getByText(/have permission to do that/)).toBeInTheDocument())
    expect(within(group()!).queryByRole('status')).toBeNull()
    expect(state.writes).toEqual([])
  })

  it('starts each team’s own box again from what is kept, once all of them have changed', async () => {
    const user = show({ all: true, manages: ['media', 'worship', 'ushers'] })
    await openPanel(user)
    await screen.findByText('Media')
    await pickTime(user, within(group()!).getByLabelText('Call time for every team'), '09:15')
    await user.click(setAll())
    // The database now holds what was asked for.
    state.rows = ['media', 'worship', 'ushers'].map((id) => ({ department_id: id, on_date: SUNDAY, call_time: '09:15:00' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Set for every team' }))
    await waitFor(() => expect(screen.getByLabelText('Call time for Ushers')).toHaveTextContent('09:15'))
    // Nothing is left looking half-edited: no team's Save is waiting to be pressed.
    for (const save of screen.getAllByRole('button', { name: 'Save' })) expect(save).toBeDisabled()
  })
})

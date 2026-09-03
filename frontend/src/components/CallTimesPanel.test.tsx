import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CallTimesPanel } from './CallTimesPanel'
import { DEFAULT_CALL_TIME } from '../lib/callTimes'

const SUNDAY = '2026-09-06'

const state = vi.hoisted(() => ({
  rows: [] as { department_id: string; on_date: string; call_time: string }[],
  writes: [] as { kind: string; payload: unknown }[],
}))

vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'gradient' }) }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: state.rows, error: null }),
      }),
      upsert: (payload: unknown) => {
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

function show({ mine = [] as string[], manages = [] as string[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CallTimesPanel
        days={DAYS}
        teams={TEAMS}
        myTeamIds={new Set(mine)}
        canManage={(id) => manages.includes(id)}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const openPanel = async (user: ReturnType<typeof show>) => {
  await user.click(screen.getByRole('button', { name: /Call times/ }))
}

const tileFor = (name: string) => screen.getByText(name).closest('li')!

beforeEach(() => {
  state.rows = [
    { department_id: 'media', on_date: SUNDAY, call_time: '08:30:00' },
    { department_id: 'worship', on_date: SUNDAY, call_time: '08:00:00' },
  ]
  state.writes = []
})

describe('the call times panel', () => {
  it('starts shut — the rota underneath is what the page is for', () => {
    show()
    expect(screen.queryByText('Media')).not.toBeInTheDocument()
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
    const field = screen.getByLabelText('Call time for Media')
    await user.clear(field)
    await user.type(field, '09:15')
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
    const field = screen.getByLabelText('Call time for Media')
    await user.clear(field)
    await user.type(field, '09:15')
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

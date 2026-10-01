import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DebriefsPage } from './DebriefsPage'

/*
 * What each team said after the service — as a list, because that is what
 * a debrief is: separate things, remembered out of order, some of them
 * somebody's to deal with before next Sunday. Read by everybody, written
 * by whoever runs the team, and kept for a month.
 */

const TODAY = '2026-09-14'

const state = vi.hoisted(() => ({
  debriefs: [] as Record<string, unknown>[],
  written: [] as { table: string; op: string; row: unknown; id?: string }[],
  leads: true,
  retention: 30,
  newDebriefId: 'db-new',
  extraServices: [] as { id: string; date: string; service_type: string }[],
  // Which teams I am on, and when each service ended (epoch ms).
  teamIds: [] as string[],
  endsAt: {} as Record<string, number>,
  now: Date.parse('2026-09-14T09:00:00Z'),
}))

vi.mock('../lib/useMyTeams', () => ({
  useMyTeams: () => ({ teamIds: state.teamIds, onATeam: state.teamIds.length > 0, settled: true }),
}))
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({
    endsAt: (id: string) => state.endsAt[id] ?? null,
    startsAt: () => null,
    now: state.now,
  }),
}))
vi.mock('../lib/useNow', () => ({ useNow: () => state.now }))
// The real clock runs on the wall clock, and these dates are in the past.
vi.mock('../components/ServiceCountdown', () => ({
  ServiceCountdown: ({ label }: { label: string }) => <span aria-label={label}>clock</span>,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: false,
    isDepartmentHead: () => state.leads,
  }),
}))

vi.mock('../lib/monthGrid', async () => {
  const actual = await vi.importActual<typeof import('../lib/monthGrid')>('../lib/monthGrid')
  return { ...actual, todayIso: () => TODAY }
})

vi.mock('../lib/appSettings', () => ({
  useAppSettings: () => ({ debrief_retention_days: state.retention, debrief_open_minutes_after: 720 }),
}))

vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: '2026-09-13', service_type: 'English Service' },
      // Long past its window: its items are gone, so it is not a heading
      // over an empty space.
      { id: 's0', date: '2026-06-01', service_type: 'Old Service' },
      // Beyond the three weeks the page looks ahead.
      { id: 's2', date: '2026-10-20', service_type: 'Far Sunday' },
      ...state.extraServices,
    ]),
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', color: '#3b82f6' },
      { id: 'd2', name: 'Audio', color: '#ef4444' },
    ]),
}))

vi.mock('../components/TeamMark', () => ({ TeamMark: () => null }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols?: string) => {
        const rows = Promise.resolve({ data: state.debriefs, error: null })
        return Object.assign(rows, {
          in: () => Promise.resolve({ data: state.debriefs, error: null }),
          // The container row is created on the way past, and its new id
          // is what the item is then hung off.
          single: () => Promise.resolve({ data: { id: state.newDebriefId }, error: null }),
        })
      },
      insert: (row: unknown) => {
        state.written.push({ table, op: 'insert', row })
        const result = Promise.resolve({ error: null })
        return Object.assign(result, {
          select: () => ({
            single: () => Promise.resolve({ data: { id: state.newDebriefId }, error: null }),
          }),
        })
      },
      update: (row: unknown) => ({
        eq: (_c: string, id: string) => {
          state.written.push({ table, op: 'update', row, id })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          state.written.push({ table, op: 'delete', row: null, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  state.extraServices = []
  state.debriefs = []
  state.written = []
  state.leads = true
  state.retention = 30
  state.newDebriefId = 'db-new'
  state.teamIds = []
  // Yesterday's English service ended late, so its team still has a few
  // hours to write it up: it is under Today's services, open.
  state.endsAt = { s1: Date.parse('2026-09-13T22:00:00Z') }
  state.now = Date.parse('2026-09-14T06:00:00Z')
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DebriefsPage />
    </QueryClientProvider>,
  )
}

const item = (over: Record<string, unknown> = {}) => ({
  id: 'it1',
  debrief_id: 'db1',
  body: 'Radio mic died again',
  assigned_to: null,
  done_at: null,
  done_by: null,
  sort_order: 0,
  created_at: '2026-09-13T20:00:00Z',
  created_by: 'u9',
  updated_at: '2026-09-13T20:00:00Z',
  author: { id: 'u9', first_name: 'Grace', last_name: 'Mensah' },
  ...over,
})

const debrief = (over: Record<string, unknown> = {}) => ({
  id: 'db1',
  service_id: 's1',
  department_id: 'd1',
  minutes: null,
  written_by: 'u9',
  created_at: '2026-09-13T20:00:00Z',
  updated_at: '2026-09-13T20:00:00Z',
  author: { id: 'u9', first_name: 'Grace', last_name: 'Mensah' },
  items: [item()],
  ...over,
})

const mediaRow = () => screen.getByText('Media').closest('li') as HTMLElement

describe('debriefs', () => {
  it('lists the services that have happened and still have minutes to keep', async () => {
    show()
    expect(await screen.findByText('English Service')).toBeInTheDocument()
    expect(screen.queryByText('Far Sunday')).toBeNull()
    expect(screen.queryByText('Old Service')).toBeNull()
  })

  it('puts the coming Sunday under Next service, and the ones after under Upcoming', async () => {
    state.extraServices = [
      { id: 'n1', date: '2026-09-20', service_type: 'Coming Sunday' },
      { id: 'n2', date: '2026-09-27', service_type: 'Sunday After' },
    ]
    show()
    const next = await screen.findByRole('region', { name: 'Next service' })
    expect(within(next).getByText('Coming Sunday')).toBeInTheDocument()
    const upcoming = screen.getByRole('region', { name: 'Upcoming services' })
    expect(within(upcoming).getByText('Sunday After')).not.toBeVisible()
    // Nothing on the day, so no Today's services.
    expect(screen.queryByRole('region', { name: 'Today’s services' })).toBeNull()
  })

  it('shows a team member the box for the coming Sunday, shut until it ends', async () => {
    state.leads = false
    state.teamIds = ['d1']
    state.extraServices = [{ id: 'n1', date: '2026-09-20', service_type: 'Coming Sunday' }]
    show()
    const next = await screen.findByRole('region', { name: 'Next service' })
    const media = within(next).getByText('Media').closest('li') as HTMLElement
    expect(within(media).getByLabelText('Add a debrief item')).toBeDisabled()
    expect(within(media).getByText('You can add to this once the service ends.')).toBeInTheDocument()
  })

  /*
   * Two services on one Sunday are one morning to write up: one date
   * heading over both, newest day first, and only the newest open.
   */
  it('groups the services of a day under one date heading, newest day first', async () => {
    state.extraServices = [
      { id: 's1b', date: '2026-09-13', service_type: 'Malayalam Service' },
      { id: 's-1', date: '2026-09-06', service_type: 'Earlier Service' },
    ]
    state.endsAt = { ...state.endsAt, s1b: state.endsAt.s1 }
    show()
    await screen.findByText('Malayalam Service')
    // Last night's is still open to its team, so Finished arrives open.
    expect(screen.getByRole('button', { name: /Finished services/ })).toHaveAttribute('aria-expanded', 'true')
    const days = screen.getAllByRole('region').filter((r) => /September/.test(r.getAttribute('aria-label') ?? ''))
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/13/),
      expect.stringMatching(/6/),
    ])
    expect(within(days[0]).getByText('English Service')).toBeInTheDocument()
    expect(within(days[0]).getByText('Malayalam Service')).toBeInTheDocument()
    expect(within(days[0]).getByText('2 services')).toBeInTheDocument()
    // How long they are kept is said once per day, not once per service.
    expect(within(days[0]).getAllByText(/Kept until/)).toHaveLength(1)
  })

  /*
   * Words that disappear unannounced are worse than words nobody wrote:
   * the page says how long they have.
   */
  it('says how long the minutes have left', async () => {
    show()
    await screen.findByText('English Service')
    expect(screen.getByText(/Kept until/)).toBeInTheDocument()
    expect(screen.getByText(/30 days left/)).toBeInTheDocument()
  })

  it('warns on the last day rather than saying "1 day"', async () => {
    state.retention = 1
    show()
    await screen.findByText('English Service')
    expect(screen.getByText(/on their last day/i)).toBeInTheDocument()
  })

  // Minutes name their speaker: each line says who said it, rather than one
  // name at the bottom standing for everything the team came up with.
  it('shows each thing said, and who said it', async () => {
    state.debriefs = [
      debrief({
        items: [
          item(),
          item({
            id: 'it2',
            body: 'Back door key needed',
            created_by: 'u8',
            author: { id: 'u8', first_name: 'Febin', last_name: 'Shaji' },
          }),
        ],
      }),
    ]
    show()
    expect(await screen.findByText('Radio mic died again')).toBeInTheDocument()
    expect(within(mediaRow()).getByText('Grace Mensah')).toBeInTheDocument()
    expect(within(mediaRow()).getByText('Febin Shaji')).toBeInTheDocument()
  })

  it('says plainly when a team has not written up', async () => {
    show()
    await screen.findByText('English Service')
    const audio = screen.getByText('Audio').closest('li') as HTMLElement
    expect(within(audio).getByText(/Nothing written up yet/)).toBeInTheDocument()
  })
})

describe('adding things to a debrief', () => {
  /*
   * The first item has to create the row that holds it: nobody sets out to
   * "create a debrief", they type the thing that went wrong and press Add.
   */
  it('creates the debrief on the way past when it is the first item', async () => {
    show()
    await screen.findByText('English Service')

    await userEvent.type(
      within(mediaRow()).getByLabelText('Add a debrief item'),
      'Projector cable needs replacing',
    )
    await userEvent.click(within(mediaRow()).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(state.written).toHaveLength(2))
    expect(state.written[0]).toMatchObject({ table: 'service_debriefs', op: 'insert' })
    expect(state.written[0].row).toMatchObject({
      service_id: 's1',
      department_id: 'd1',
      written_by: 'u1',
    })
    expect(state.written[1]).toMatchObject({ table: 'service_debrief_items', op: 'insert' })
    expect(state.written[1].row).toMatchObject({
      debrief_id: 'db-new',
      body: 'Projector cable needs replacing',
      created_by: 'u1',
      sort_order: 0,
    })
  })

  it('hangs later items off the debrief that already exists', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.type(
      within(mediaRow()).getByLabelText('Add a debrief item'),
      'Back door key needed',
    )
    await userEvent.click(within(mediaRow()).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ table: 'service_debrief_items', op: 'insert' })
    expect(state.written[0].row).toMatchObject({ debrief_id: 'db1', sort_order: 1 })
  })

  /*
   * Adding is a line and nothing else. Asking who each thing was on made
   * every item a small form to fill in, when most of what gets said after
   * a service is only worth writing down.
   */
  it('asks for nothing but the line itself', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')
    expect(within(mediaRow()).queryByLabelText('Who it is on')).toBeNull()
  })

  // A debrief comes out in a rush; a box that has to be re-opened between
  // items loses the fourth and fifth things anybody said.
  it('empties itself and stays open for the next thing', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')

    const box = within(mediaRow()).getByLabelText('Add a debrief item')
    await userEvent.type(box, 'Order batteries')
    await userEvent.click(within(mediaRow()).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(box).toHaveValue(''))
    expect(within(mediaRow()).getByLabelText('Add a debrief item')).toBeInTheDocument()
  })

  it('adds on Enter, without reaching for the button', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.type(
      within(mediaRow()).getByLabelText('Add a debrief item'),
      'Order batteries{Enter}',
    )
    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).toMatchObject({ body: 'Order batteries' })
  })

  it('will not add an empty item', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')
    expect(within(mediaRow()).getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})

describe('working through the list', () => {
  it('ticks an item off, naming who ticked it', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.click(screen.getByLabelText('Tick off: Radio mic died again'))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ table: 'service_debrief_items', op: 'update', id: 'it1' })
    expect(state.written[0].row).toMatchObject({ done_by: 'u1' })
    expect((state.written[0].row as { done_at: string }).done_at).toBeTruthy()
  })

  /*
   * An item ticked by mistake that cannot be un-ticked teaches people not
   * to tick anything.
   */
  it('puts a ticked item back', async () => {
    state.debriefs = [debrief({ items: [item({ done_at: '2026-09-14T09:00:00Z', done_by: 'u9' })] })]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.click(screen.getByLabelText('Put back: Radio mic died again'))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).toMatchObject({ done_at: null, done_by: null })
  })

  it('says how much of the list is dealt with', async () => {
    state.debriefs = [
      debrief({
        items: [item({ id: 'a', done_at: '2026-09-14T09:00:00Z' }), item({ id: 'b', body: 'Key' })],
      }),
    ]
    show()
    await screen.findByText('Radio mic died again')
    expect(within(mediaRow()).getByText('1/2 done')).toBeInTheDocument()
  })

  it('rewords an item in place', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.click(within(mediaRow()).getByRole('button', { name: 'Edit' }))
    const box = screen.getByLabelText('Edit this item')
    await userEvent.clear(box)
    await userEvent.type(box, 'Radio mic died again — batteries ordered')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ op: 'update', id: 'it1' })
    expect(state.written[0].row).toMatchObject({ body: 'Radio mic died again — batteries ordered' })
  })

  it('removes one item without touching the rest', async () => {
    state.debriefs = [debrief({ items: [item(), item({ id: 'it2', body: 'Back door key needed' })] })]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.click(screen.getByLabelText('Remove: Radio mic died again'))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({
      table: 'service_debrief_items',
      op: 'delete',
      id: 'it1',
    })
  })

  /*
   * The debrief row exists only to hold items. Taking the last one off
   * used to leave a card saying "nothing written up yet" that still
   * offered to remove minutes which were not there.
   */
  it('takes the empty debrief with the last item', async () => {
    state.debriefs = [debrief()]
    show()
    await screen.findByText('Radio mic died again')

    await userEvent.click(screen.getByLabelText('Remove: Radio mic died again'))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({
      table: 'service_debriefs',
      op: 'delete',
      id: 'db1',
    })
  })

  it('does not offer to remove a list that is not there', async () => {
    state.debriefs = [debrief({ items: [] })]
    show()
    await screen.findByText('English Service')
    expect(within(mediaRow()).queryByRole('button', { name: 'Remove all' })).toBeNull()
  })
})

describe('who may write', () => {
  // Everybody reads; only whoever runs the team writes.
  it('lets somebody who runs no team read but not write', async () => {
    state.leads = false
    state.debriefs = [debrief()]
    show()

    expect(await screen.findByText('Radio mic died again')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a debrief item')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByLabelText('Tick off: Radio mic died again')).toBeDisabled()
  })
})

/*
 * Anybody on the team writes in their own team's debrief, from when the
 * service ends until twelve hours after (0120). Heads and Admins are not
 * held to that, and keep the tick and everybody else's points.
 */
describe('a team writing its own debrief', () => {
  const ENDED = Date.parse('2026-09-13T12:00:00Z')
  beforeEach(() => {
    state.leads = false
    state.teamIds = ['d1']
    state.endsAt = { s1: ENDED }
  })

  it('opens to the team when the service ends, and lets them add a point', async () => {
    state.now = ENDED + 3 * 3_600_000
    const user = userEvent.setup()
    show()
    await screen.findByText('English Service')
    expect(screen.getByLabelText(/left for the team to write/)).toBeInTheDocument()
    const box = within(mediaRow()).getByLabelText('Add a debrief item')
    expect(box).toBeEnabled()
    await user.type(box, 'Monitor 3 too loud{Enter}')
    await waitFor(() =>
      expect(state.written).toContainEqual(
        expect.objectContaining({ table: 'service_debriefs', op: 'insert' }),
      ),
    )
  })

  it('gives another team no box at all', async () => {
    state.now = ENDED + 3 * 3_600_000
    show()
    await screen.findByText('English Service')
    const audio = screen.getByText('Audio').closest('li') as HTMLElement
    expect(within(audio).queryByLabelText('Add a debrief item')).toBeNull()
  })

  it('shows the box shut until the service ends', async () => {
    state.now = ENDED - 3_600_000
    show()
    await screen.findByText('English Service')
    expect(screen.getByLabelText(/until the team can write/)).toBeInTheDocument()
    expect(within(mediaRow()).getByLabelText('Add a debrief item')).toBeDisabled()
    expect(within(mediaRow()).getByText('You can add to this once the service ends.')).toBeInTheDocument()
  })

  it('shuts the box to the team twelve hours after the service ends, and files it under Finished', async () => {
    state.now = ENDED + 13 * 3_600_000
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: /Finished services/ }))
    expect(screen.getByText(/^Closed to the team (?!—)/)).toBeInTheDocument()
    expect(within(mediaRow()).getByText(/their Head can still add to it/)).toBeInTheDocument()
    expect(within(mediaRow()).getByLabelText('Add a debrief item')).toBeDisabled()
  })

  it('lets a member change their own point, not anybody else’s, and never tick', async () => {
    state.now = ENDED + 3 * 3_600_000
    state.debriefs = [
      debrief({
        items: [
          item({ id: 'mine', body: 'My point', created_by: 'u1' }),
          item({ id: 'theirs', body: 'Their point', created_by: 'u9', sort_order: 1 }),
        ],
      }),
    ]
    show()
    await screen.findByText('My point')
    expect(screen.getByRole('button', { name: 'Remove: My point' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove: Their point' })).toBeNull()
    expect(screen.getByLabelText('Tick off: My point')).toBeDisabled()
  })

  it('stops a member changing their point once a Head has ticked it', async () => {
    state.now = ENDED + 3 * 3_600_000
    state.debriefs = [debrief({ items: [item({ body: 'My point', created_by: 'u1', done_at: '2026-09-13T13:00:00Z' })] })]
    show()
    await screen.findByText('My point')
    expect(screen.queryByRole('button', { name: 'Remove: My point' })).toBeNull()
  })

  it('does not hold a Head to the window', async () => {
    state.leads = true
    state.now = ENDED + 30 * 3_600_000
    show()
    await screen.findByText('English Service')
    expect(within(mediaRow()).getByLabelText('Add a debrief item')).toBeEnabled()
  })
})

/*
 * Minutes typed into the old box, before the list replaced it. Nothing
 * writes them any more, but words somebody wrote must not vanish because
 * the shape of the page changed underneath them.
 */
describe('minutes from the build before this one', () => {
  it('still shows a paragraph somebody typed into the old box', async () => {
    state.debriefs = [debrief({ items: [], minutes: 'Radio mic died again; batteries on the list.' })]
    show()
    expect(await screen.findByText(/batteries on the list/)).toBeInTheDocument()
  })
})

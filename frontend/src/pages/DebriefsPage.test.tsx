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
  useAppSettings: () => ({ debrief_retention_days: state.retention }),
}))

vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: '2026-09-13', service_type: 'English Service' },
      // Long past its window: its items are gone, so it is not a heading
      // over an empty space.
      { id: 's0', date: '2026-06-01', service_type: 'Old Service' },
      // Still to come — there is nothing to debrief yet.
      { id: 's2', date: '2026-09-20', service_type: 'Next Sunday' },
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
  state.debriefs = []
  state.written = []
  state.leads = true
  state.retention = 30
  state.newDebriefId = 'db-new'
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
    expect(screen.queryByText('Next Sunday')).toBeNull()
    expect(screen.queryByText('Old Service')).toBeNull()
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

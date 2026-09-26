import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { ServicePlannerIndexPage } from './ServicePlannerIndexPage'
import { chooseOption } from '../test/select'

const auth = { isAdmin: true }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
const db = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: unknown }[],
  inserted: [] as unknown[],
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      insert: (row: unknown) => {
        db.inserted.push(row)
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: 'one-off' }, error: null }) }),
        }
      },
    }),
    rpc: (fn: string, args: unknown) => {
      db.rpc.push({ fn, args })
      return Promise.resolve({ data: 'first-of-series', error: null })
    },
  },
}))
const planner = vi.hoisted(() => ({ services: [] as Record<string, unknown>[] }))
vi.mock('../lib/monthGrid', async () => {
  const actual = await vi.importActual<typeof import('../lib/monthGrid')>('../lib/monthGrid')
  return { ...actual, todayIso: () => '2026-09-26' }
})
vi.mock('../lib/queries', () => ({
  fetchServices: () => Promise.resolve(planner.services),
  fetchServiceTemplates: () => Promise.resolve([]),
  fetchTemplateSessions: () => Promise.resolve([]),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // A data router, because the page's unsaved-changes guard uses
  // useBlocker, which only exists on one.
  const router = createMemoryRouter(
    [
      { path: '/service-planner', element: <ServicePlannerIndexPage /> },
      { path: '/service-planner/:id', element: <p>Opened service</p> },
    ],
    { initialEntries: ['/service-planner'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('ServicePlannerIndexPage', () => {
  it('offers an Admin the one way to start a service', async () => {
    // This button used to live in the sidebar. When the sidebar became a
    // dock of destinations it went with it, and there was then no way at
    // all to create a service — so this test exists to keep it reachable.
    auth.isAdmin = true
    renderPage()
    expect(await screen.findByRole('button', { name: /new service/i })).toBeInTheDocument()
  })

  it('opens the form when it is pressed', async () => {
    auth.isAdmin = true
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: /new service/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('closes on Escape, and on a click outside the form', async () => {
    // The dialog used to have neither: once open, the only way out was the
    // Cancel button, and a person who pressed Escape (or tapped the dimmed
    // page, which every other sheet in the app closes on) was stuck.
    auth.isAdmin = true
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'New service' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(await screen.findByRole('button', { name: 'New service' }))
    // The backdrop is the dialog element itself; the form sits inside it.
    await user.click(await screen.findByRole('dialog'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('leaves nothing behind when it is cancelled', async () => {
    // Tapping a day filled the date in, and cancelling left it filled in:
    // the form still counted as half-written, so the next click on any
    // other page was met with "leave this page?" about a service nobody
    // was writing. Cancelling puts the draft back where it was found.
    auth.isAdmin = true
    const user = renderPage()
    await user.click((await screen.findAllByRole('button', { name: /new service on/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/service type/i), 'Carols')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await user.click(await screen.findByRole('button', { name: 'New service' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByLabelText(/service type/i)).toHaveValue('')
    expect(within(reopened).getByLabelText(/^date$/i)).toHaveValue('')
  })

  it('does not offer it to someone who cannot schedule services', async () => {
    auth.isAdmin = false
    renderPage()
    expect(screen.queryByRole('button', { name: /new service/i })).not.toBeInTheDocument()
  })
})

/*
 * A service that comes round again.
 *
 * Typed in by hand every week, a Sunday somebody forgot on the Saturday had
 * no availability, no rota and no running order. Now it can repeat — and
 * what it makes are ordinary services, made in the database all at once.
 */
describe('a service that repeats', () => {
  async function openForm() {
    auth.isAdmin = true
    db.rpc = []
    db.inserted = []
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: /new service/i }))
    const dialog = await screen.findByRole('dialog')
    return { user, dialog }
  }

  it('makes one service when it is left not repeating, as it always did', async () => {
    const { user, dialog } = await openForm()
    await user.type(within(dialog).getByLabelText('Date'), '2026-10-04')
    await user.type(within(dialog).getByLabelText(/service type/i), 'English Service')
    await user.click(within(dialog).getByRole('button', { name: /^\W*Create service$/ }))

    await screen.findByText('Opened service')
    expect(db.inserted).toEqual([{ date: '2026-10-04', service_type: 'English Service' }])
    expect(db.rpc).toEqual([])
  })

  it('words the choices for the day that was picked', async () => {
    const { user, dialog } = await openForm()
    await user.type(within(dialog).getByLabelText('Date'), '2026-10-04')
    await chooseOption(user, within(dialog).getByRole('combobox', { name: 'Repeats' }), 'Monthly on the first Sunday')
    expect(within(dialog).getByRole('combobox', { name: 'Repeats' })).toHaveTextContent('Monthly on the first Sunday')
  })

  /*
   * The dates are shown before anything is made: a date picked on the
   * wrong day is eight services to delete by hand once it has repeated.
   */
  it('shows the dates it will land on, and that each one stands alone', async () => {
    const { user, dialog } = await openForm()
    await user.type(within(dialog).getByLabelText('Date'), '2026-10-04')
    await chooseOption(user, within(dialog).getByRole('combobox', { name: 'Repeats' }), 'Every two weeks on Sunday')
    expect(within(dialog).getByText(/4 Oct, 18 Oct, 1 Nov, 15 Nov/)).toBeInTheDocument()
    expect(within(dialog).getByText(/delete one and the others stay/)).toBeInTheDocument()
  })

  it('starts a repeat in the database and opens its first service', async () => {
    const { user, dialog } = await openForm()
    await user.type(within(dialog).getByLabelText('Date'), '2026-10-04')
    await user.type(within(dialog).getByLabelText(/service type/i), 'English Service')
    await chooseOption(user, within(dialog).getByRole('combobox', { name: 'Repeats' }), 'Every week on Sunday')
    await user.click(within(dialog).getByRole('button', { name: /Create repeating service/ }))

    await screen.findByText('Opened service')
    expect(db.rpc).toEqual([
      {
        fn: 'create_service_series',
        args: {
          first_date: '2026-10-04',
          service_name: 'English Service',
          how_often: 'weekly',
          template: null,
        },
      },
    ])
    // Not also made one at a time from here: the repeat is the database's.
    expect(db.inserted).toEqual([])
  })
})

/*
 * The agenda under the calendar used to stop at a count — six by default —
 * which a few weeks of repeating Sunday services filled, leaving the
 * Christmas service somebody had already planned off the page. It is the
 * year ahead now, the same distance the diary looks.
 */
describe('the services listed under the calendar', () => {
  const svc = (id: string, date: string) => ({
    id,
    date,
    service_type: `Service ${id}`,
    created_at: '2026-09-01T00:00:00Z',
    ended_at: null,
  })

  it('lists every service in the next year, not just the next six', async () => {
    auth.isAdmin = true
    // Twelve Sundays from 27 Sep, then Christmas.
    planner.services = [
      ...Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 8, 27 + 7 * i))
        return svc(`w${i}`, d.toISOString().slice(0, 10))
      }),
      svc('xmas', '2026-12-25'),
    ]
    renderPage()
    const list = (await screen.findByText('Upcoming services')).closest('section') as HTMLElement
    await waitFor(() => expect(within(list).getAllByText(/^Service /)).toHaveLength(13))
    expect(within(list).getByText('Service xmas')).toBeInTheDocument()
  })

  it('stops at a year from today', async () => {
    auth.isAdmin = true
    planner.services = [svc('near', '2027-09-25'), svc('far', '2027-09-27')]
    renderPage()
    const list = (await screen.findByText('Upcoming services')).closest('section') as HTMLElement
    expect(within(list).getByText('Service near')).toBeInTheDocument()
    expect(within(list).queryByText('Service far')).toBeNull()
  })
})

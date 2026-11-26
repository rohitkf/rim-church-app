import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
import { ServicePlannerIndexPage, ServicesView } from './ServicePlannerIndexPage'
import { chooseOption } from '../test/select'
import { pickDate } from '../test/pickers'

const auth = { isAdmin: true, session: { user: { id: 'u1' } } }
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
const access = vi.hoisted(() => ({ calendar: true, settled: true }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({ settled: access.settled, canOpen: (path: string) => path !== '/events' || access.calendar }),
}))
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
      // The list on its own, as somebody without the Calendar gets it; with the Calendar it is that page's Services view.
      { path: '/service-planner', element: <ServicesView standalone /> },
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
    expect(within(reopened).getByRole('button', { name: 'Date of the service' })).toHaveTextContent('Choose a date')
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
    await pickDate(user, within(dialog).getByRole('button', { name: 'Date of the service' }), '2026-10-04')
    await user.type(within(dialog).getByLabelText(/service type/i), 'English Service')
    await user.click(within(dialog).getByRole('button', { name: /^\W*Create service$/ }))

    await screen.findByText('Opened service')
    expect(db.inserted).toEqual([{ date: '2026-10-04', service_type: 'English Service' }])
    expect(db.rpc).toEqual([])
  })

  it('words the choices for the day that was picked', async () => {
    const { user, dialog } = await openForm()
    await pickDate(user, within(dialog).getByRole('button', { name: 'Date of the service' }), '2026-10-04')
    await chooseOption(user, within(dialog).getByRole('combobox', { name: 'Repeats' }), 'Monthly on the first Sunday')
    expect(within(dialog).getByRole('combobox', { name: 'Repeats' })).toHaveTextContent('Monthly on the first Sunday')
  })

  /*
   * The dates are shown before anything is made: a date picked on the
   * wrong day is eight services to delete by hand once it has repeated.
   */
  it('shows the dates it will land on, and that each one stands alone', async () => {
    const { user, dialog } = await openForm()
    await pickDate(user, within(dialog).getByRole('button', { name: 'Date of the service' }), '2026-10-04')
    await chooseOption(user, within(dialog).getByRole('combobox', { name: 'Repeats' }), 'Every two weeks on Sunday')
    expect(within(dialog).getByText(/4 Oct, 18 Oct, 1 Nov, 15 Nov/)).toBeInTheDocument()
    expect(within(dialog).getByText(/delete one and the others stay/)).toBeInTheDocument()
  })

  it('starts a repeat in the database and opens its first service', async () => {
    const { user, dialog } = await openForm()
    await pickDate(user, within(dialog).getByRole('button', { name: 'Date of the service' }), '2026-10-04')
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

  it('lists three weeks of upcoming services out of the box (0223)', async () => {
    auth.isAdmin = true
    // Twelve Sundays from 27 Sep, then Christmas. Today is 26 Sep.
    planner.services = [
      ...Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 8, 27 + 7 * i))
        return svc(`w${i}`, d.toISOString().slice(0, 10))
      }),
      svc('xmas', '2026-12-25'),
    ]
    renderPage()
    // The next service day (27 Sep), then 4 and 11 Oct: within 21 days.
    await screen.findByRole('region', { name: 'Upcoming services' })
    const inList = () =>
      ['Today’s services', 'Next service', 'Upcoming services']
        .map((name) => screen.queryByRole('region', { name }))
        .flatMap((r) => (r ? within(r).queryAllByText(/^Service /) : []))
    await waitFor(() => expect(inList()).toHaveLength(3))
    const upcoming = screen.getByRole('region', { name: 'Upcoming services' })
    expect(within(upcoming).getByText('Service w2')).toBeInTheDocument()
    expect(within(upcoming).queryByText('Service w3')).toBeNull()
    expect(screen.queryByText('Service xmas')).toBeNull()
  })

  it('shows the next service day however far away it is, up to a year', async () => {
    auth.isAdmin = true
    planner.services = [svc('near', '2027-09-25'), svc('far', '2027-09-27')]
    renderPage()
    const next = await screen.findByRole('region', { name: 'Next service' })
    expect(within(next).getByText('Service near')).toBeInTheDocument()
    expect(screen.queryByText('Service far')).toBeNull()
  })
})

/*
 * The planner's own address (November 2026). The list of services is the
 * Calendar's Services view now, so every link that was ever made to
 * /service-planner — a bookmark, a notification, the Dashboard's "New
 * service" — lands there, carrying what it asked for.
 */
describe('the planner’s own address', () => {
  function Calendar() {
    const { pathname, search } = useLocation()
    return <p data-testid="calendar">{pathname + search}</p>
  }
  function open(at: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        { path: '/service-planner', element: <ServicePlannerIndexPage /> },
        { path: '/events', element: <Calendar /> },
      ],
      { initialEntries: [at] },
    )
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('goes to the Calendar’s Services view', async () => {
    access.calendar = true
    access.settled = true
    open('/service-planner')
    expect(await screen.findByTestId('calendar')).toHaveTextContent('/events?show=service')
  })

  it('carries a new service and its date with it', async () => {
    access.calendar = true
    open('/service-planner?new=1&date=2026-10-04')
    const at = (await screen.findByTestId('calendar')).textContent ?? ''
    const asked = new URLSearchParams(at.split('?')[1])
    expect(Object.fromEntries(asked)).toEqual({ new: '1', date: '2026-10-04', show: 'service' })
  })

  it('is the list on its own for somebody the Calendar is closed to', async () => {
    access.calendar = false
    open('/service-planner')
    expect(await screen.findByRole('heading', { name: 'Service Planner' })).toBeInTheDocument()
    expect(screen.queryByTestId('calendar')).toBeNull()
  })

  it('waits to know who may open what before it sends anybody anywhere', () => {
    access.calendar = false
    access.settled = false
    open('/service-planner')
    expect(screen.queryByTestId('calendar')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Service Planner' })).toBeNull()
    access.settled = true
  })
})

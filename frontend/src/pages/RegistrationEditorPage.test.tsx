import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationEditorPage } from './RegistrationEditorPage'
import { pickDate, pickTime } from '../test/pickers'
import type { EventDraft, RegistrationEventFull } from '../lib/registrations'

/*
 * Making a registration event (0244), all on one page: the words, the
 * dates, the tickets, promo codes, the map, the window, how to pay.
 */

const state = vi.hoisted(() => ({
  existing: null as unknown,
  saved: [] as { draft: EventDraft; existing: unknown }[],
  synced: [] as unknown[],
  geocoded: [] as string[],
  suggested: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/toast', () => ({ showToast: () => undefined }))
vi.mock('../components/PlaceMap', () => ({
  PlaceMap: ({ lat, lng, onMove }: { lat: number; lng: number; onMove?: (to: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onMove?.({ lat: lat + 0.01, lng })}>
      map at {lat.toFixed(2)},{lng.toFixed(2)}
    </button>
  ),
}))
vi.mock('../lib/geocode', () => ({
  geocodeAddress: (address: string) => {
    state.geocoded.push(address)
    return Promise.resolve(address.includes('Nowhere') ? null : { latitude: 51.45, longitude: -0.97, label: 'High Street, Reading' })
  },
  suggestAddresses: (text: string) => {
    state.suggested.push(text)
    return Promise.resolve(
      text.includes('Nowhere')
        ? []
        : [
            { latitude: 51.45, longitude: -0.97, label: '12, High Street, Reading, RG1 2AB, United Kingdom' },
            { latitude: 51.46, longitude: -0.98, label: '12, High Street, Caversham, Reading, United Kingdom' },
          ],
    )
  },
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchRegistrationEvent: () => Promise.resolve(state.existing),
  saveRegistrationEvent: (draft: EventDraft, existing: unknown) => {
    state.saved.push({ draft, existing })
    return Promise.resolve('e-saved')
  },
  syncRegistrationDiary: (event: unknown) => {
    state.synced.push(event)
    return Promise.resolve()
  },
}))

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const full = (): RegistrationEventFull => ({
  event: {
    id: 'e1',
    slug: 'plc-2026',
    title: 'Pastors & Leaders 2026',
    description: 'Two evenings.',
    image_path: null,
    status: 'published',
    date_mode: 'all',
    location_name: 'Church Hall',
    address: '12 High Street, Reading',
    latitude: 51.45,
    longitude: -0.97,
    registration_opens_at: null,
    registration_closes_at: null,
    min_per_order: 1,
    max_per_order: 10,
    payment_links: [{ label: 'Pay with PayPal', url: 'https://paypal.me/rim' }],
    payment_accounts: [],
    payment_use_church_giving: true,
    payment_note: null,
    allow_pay_at_reception: true,
    add_to_diary: true,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  },
  dates: [{ id: 'd1', event_id: 'e1', starts_at: at(2026, 11, 21, 18, 30), ends_at: at(2026, 11, 21, 21, 0), label: null, sort_order: 0, diary_event_id: null }],
  ticketTypes: [{ id: 't1', event_id: 'e1', name: 'With lunch', description: null, kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: 40, sort_order: 0 }],
  promoCodes: [{ id: 'p1', event_id: 'e1', code: 'EARLY', kind: 'percent', value: 10, ticket_type_ids: [], max_uses: null, uses: 0, active: true }],
})

function EventStub() {
  const { id } = useParams()
  return <p>event page {id}</p>
}

function show(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/registrations/new" element={<RegistrationEditorPage />} />
          <Route path="/registrations/:id/edit" element={<RegistrationEditorPage />} />
          <Route path="/registrations/:id" element={<EventStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.existing = null
  state.saved = []
  state.synced = []
  state.geocoded = []
  state.suggested = []
})

describe('making a registration event', () => {
  it('makes the link from the title until it is changed by hand', async () => {
    const user = show('/registrations/new')
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Pastors & Leaders 2026')
    const link = screen.getByRole('textbox', { name: /^Link/ })
    expect(link).toHaveValue('pastors-leaders-2026')
    expect(screen.getByText('https://rim-church-app.vercel.app/register/pastors-leaders-2026')).toBeInTheDocument()

    await user.clear(link)
    await user.type(link, 'PLC 26')
    expect(link).toHaveValue('plc-26')
    await user.type(screen.getByRole('textbox', { name: 'Title' }), ' extra')
    expect(link).toHaveValue('plc-26')
  })

  it('lists what is missing instead of saving', async () => {
    const user = show('/registrations/new')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    const problems = screen.getByRole('alert', { name: 'Before this can be saved' })
    expect(within(problems).getByText('Give the event a title.')).toBeInTheDocument()
    expect(within(problems).getByText('Date 1 needs a day and a start time.')).toBeInTheDocument()
    expect(state.saved).toEqual([])
  })

  it('saves a complete draft and goes to the event', async () => {
    const user = show('/registrations/new')
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Youth Night')
    await pickDate(user, screen.getByRole('button', { name: 'Date 1' }), '2026-11-21')
    await pickTime(user, screen.getByRole('button', { name: 'Date 1 starts' }), '18:30')
    await user.click(screen.getByRole('radio', { name: 'Paid' }))
    await user.type(screen.getByRole('textbox', { name: 'Price (£)' }), '5')
    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '50')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))

    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved).toHaveLength(1)
    expect(state.saved[0].existing).toBeNull()
    expect(state.saved[0].draft).toMatchObject({
      title: 'Youth Night',
      slug: 'youth-night',
      sameTimes: false,
      dates: [{ date: '2026-11-21', start: '18:30' }],
      ticketTypes: [{ name: 'General admission', kind: 'paid', price: '5', quantity: '50', isNew: true }],
    })
    // A draft is not in the diary yet.
    expect(state.synced).toEqual([])
  })

  it('adds dates, tickets and promo codes, and takes them away again', async () => {
    const user = show('/registrations/new')
    await user.click(screen.getByRole('button', { name: /Add a date/ }))
    expect(screen.getByRole('group', { name: 'Date 2' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: 'Date 2' })).getByRole('button', { name: 'Remove this date' }))
    expect(screen.queryByRole('group', { name: 'Date 2' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /Add a ticket type/ }))
    expect(screen.getByRole('group', { name: 'Ticket 2' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add a promo code/ }))
    const promo = screen.getByRole('group', { name: 'Promo code 1' })
    await user.type(within(promo).getByRole('textbox', { name: 'Code' }), 'early bird!')
    expect(within(promo).getByRole('textbox', { name: 'Code' })).toHaveValue('EARLYBIRD')
    // No paid ticket yet, so nothing to limit the code to.
    expect(within(promo).getByText(/Make a ticket type paid above/)).toBeInTheDocument()
    // Make the first ticket paid: the code can name it before anything is saved.
    await user.click(within(screen.getByRole('group', { name: 'Ticket 1' })).getByRole('radio', { name: 'Paid' }))
    await user.click(within(promo).getByRole('radio', { name: 'Only these tickets' }))
    await user.click(within(promo).getByRole('checkbox', { name: 'General admission' }))
    expect(within(promo).getByRole('checkbox', { name: 'General admission' })).toBeChecked()
  })

  it('suggests places as they are typed in the map search, and puts the pin on the one picked — the address stays as typed', async () => {
    const user = show('/registrations/new')
    await user.type(screen.getByRole('textbox', { name: /^Address/ }), 'The hall behind the church')
    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), '12 High Street')
    const list = await screen.findByRole('list', { name: 'Places found' })
    expect(within(list).getAllByRole('button')).toHaveLength(2)
    await user.click(within(list).getByRole('button', { name: /Caversham/ }))
    expect(screen.getByText('map at 51.46,-0.98')).toBeInTheDocument()
    expect(screen.getByText('Pin at 51.46000, -0.98000')).toBeInTheDocument()
    // The address is the church's own words, not the map's label — unless asked.
    expect(screen.getByRole('textbox', { name: /^Address/ })).toHaveValue('The hall behind the church')
    expect(screen.queryByRole('list', { name: 'Places found' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Use as the address' }))
    expect(screen.getByRole('textbox', { name: /^Address/ })).toHaveValue('12, High Street, Caversham, Reading, United Kingdom')
    expect(screen.queryByRole('button', { name: 'Use as the address' })).toBeNull()
    // The last thing asked was the whole text typed, not every keystroke.
    expect(state.suggested[state.suggested.length - 1]).toBe('12 High Street')
  })

  it('finds the address on the map when nothing is searched, and lets the pin be moved or cleared', async () => {
    const user = show('/registrations/new')
    expect(screen.getByRole('button', { name: 'Find' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: /^Address/ }), '12 High Street, Reading')
    // Typing the address asks the map nothing on its own.
    expect(state.suggested).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByText('map at 51.45,-0.97')).toBeInTheDocument()
    expect(state.geocoded).toEqual(['12 High Street, Reading'])
    expect(screen.getByText('Found: High Street, Reading')).toBeInTheDocument()
    expect(screen.getByText('Pin at 51.45000, -0.97000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'map at 51.45,-0.97' }))
    expect(screen.getByText('map at 51.46,-0.97')).toBeInTheDocument()
    expect(screen.getByText('Pin at 51.46000, -0.97000')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Address/ })).toHaveValue('12 High Street, Reading')

    await user.click(screen.getByRole('button', { name: 'Clear the pin' }))
    expect(screen.queryByText(/map at/)).toBeNull()
  })

  it('says, by the map search, when nothing matches', async () => {
    const user = show('/registrations/new')
    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'Nowhere Lane')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Nothing on the map matches/)
    // Beside the Where section, not at the foot of the page.
    expect(alert.compareDocumentPosition(screen.getByRole('button', { name: 'Save as draft' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows where the picture’s subject is, and saves it moved (0248)', async () => {
    const f = full()
    f.event.image_path = 'events/x.jpg'
    f.event.image_focus_x = 20
    f.event.image_focus_y = 80
    state.existing = f
    const user = show('/registrations/e1/edit')
    // Shown as the page will crop it; nothing to drag until asked for.
    expect(await screen.findByRole('img', { name: /How the picture will show/ })).toHaveStyle({ objectPosition: '20% 80%' })
    expect(screen.queryByRole('slider', { name: 'Left to right' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Position the picture' }))
    const dialog = screen.getByRole('dialog', { name: 'Position the picture' })
    expect(within(dialog).getByRole('slider', { name: 'Left to right' })).toHaveValue('20')
    expect(within(dialog).getByRole('slider', { name: 'Top to bottom' })).toHaveValue('80')
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Left to right' }), { target: { value: '35' } })
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('img', { name: /How the picture will show/ })).toHaveStyle({ objectPosition: '35% 80%' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved[0].draft).toMatchObject({ imagePath: 'events/x.jpg', imageFocus: { x: 35, y: 80 } })
  })

  it('makes an event online, with its way in, and keeps no place for it (0249)', async () => {
    state.existing = full()
    const user = show('/registrations/e1/edit')
    await screen.findByRole('textbox', { name: 'Title' })
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    expect(screen.queryByRole('textbox', { name: /^Address/ })).toBeNull()
    await user.type(screen.getByRole('textbox', { name: /Link to join/ }), 'zoom.us/j/1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/must start with https/)).toBeInTheDocument()
    expect(state.saved).toEqual([])
    await user.clear(screen.getByRole('textbox', { name: /Link to join/ }))
    await user.type(screen.getByRole('textbox', { name: /Link to join/ }), 'https://zoom.us/j/1')
    await user.type(screen.getByRole('textbox', { name: /Meeting ID/ }), 'Passcode 2026')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved[0].draft).toMatchObject({ attendance: 'online', joinUrl: 'https://zoom.us/j/1', joinDetails: 'Passcode 2026' })
  })

  it('lets a promo code be for every paid ticket or only the ones ticked', async () => {
    state.existing = full()
    const user = show('/registrations/e1/edit')
    const code = within(await screen.findByRole('group', { name: 'Promo code 1' }))
    expect(code.getByRole('radio', { name: 'Every paid ticket' })).toBeChecked()
    expect(code.queryByRole('checkbox', { name: 'With lunch' })).toBeNull()
    await user.click(code.getByRole('radio', { name: 'Only these tickets' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/tick the tickets it is for/)).toBeInTheDocument()
    await user.click(code.getByRole('checkbox', { name: 'With lunch' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved[0].draft.promoCodes[0]).toMatchObject({ limited: true, ticketTypeIds: ['t1'] })
  })

  it('lets a promo code say how many tickets it covers, and warns about a free one that does not (0296)', async () => {
    const existing = full()
    existing.promoCodes = [{ ...existing.promoCodes[0], value: 100 }]
    state.existing = existing
    const user = show('/registrations/e1/edit')
    const code = within(await screen.findByRole('group', { name: 'Promo code 1' }))
    // 100% off and no number: every ticket in the order would be free.
    expect(code.getByRole('note')).toHaveTextContent('With no number here, this code makes every ticket in an order free. Put 1 for one free ticket an order.')
    const covered = code.getByRole('textbox', { name: 'Tickets covered (optional)' })
    expect(covered).toHaveValue('')
    await user.type(covered, '1')
    expect(code.queryByRole('note')).toBeNull()
    expect(code.getByText('The discount is on one ticket of each order, the dearest first. Any more are at full price.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved[0].draft.promoCodes[0]).toMatchObject({ code: 'EARLY', covered: '1' })
  })

  it('opens a saved event with everything on it, and keeps the diary in step when saved', async () => {
    state.existing = full()
    const user = show('/registrations/e1/edit')
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Pastors & Leaders 2026')
    expect(screen.getByRole('textbox', { name: /^Link https/ })).toHaveValue('plc-2026')
    // Published: the link is out, so it is read-only (0254).
    expect(screen.getByRole('textbox', { name: /^Link https/ })).toBeDisabled()
    expect(screen.getByText(/so it cannot change now/)).toBeInTheDocument()
    const ticket = screen.getByRole('group', { name: 'Ticket 1' })
    expect(within(ticket).getByRole('textbox', { name: 'Name' })).toHaveValue('With lunch')
    expect(within(ticket).getByRole('textbox', { name: 'Price (£)' })).toHaveValue('20.00')
    expect(within(ticket).getByRole('textbox', { name: 'Quantity' })).toHaveValue('40')
    expect(within(screen.getByRole('group', { name: 'Promo code 1' })).getByRole('textbox', { name: 'Code' })).toHaveValue('EARLY')
    // A code with no tickets named is for every paid ticket.
    expect(within(screen.getByRole('group', { name: 'Promo code 1' })).getByRole('radio', { name: 'Every paid ticket' })).toBeChecked()
    expect(screen.getByText('map at 51.45,-0.97')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Link$/ })).toHaveValue('https://paypal.me/rim')
    expect(screen.getByRole('checkbox', { name: /church diary/ })).toBeChecked()

    await user.type(screen.getByRole('textbox', { name: 'Title' }), ' — Reading')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved[0].draft.title).toBe('Pastors & Leaders 2026 — Reading')
    expect(state.saved[0].existing).toEqual(full())
    expect(state.synced).toEqual([{ id: 'e-saved', slug: 'plc-2026' }])
  })
})

/*
 * The agenda (0303): the running order of the day, written in the editor
 * and shown on the event's page. Only a title is asked for.
 */
describe('an event’s agenda in the editor', () => {
  const titleOf = (n: number) => screen.getByRole('textbox', { name: `Agenda item ${n} title` })

  it('starts with none, and says an event does not need one', () => {
    show('/registrations/new')
    expect(screen.getByText('No agenda yet. An event does not need one.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Agenda item 1' })).toBeNull()
  })

  it('adds an item with only a title, and saves it with the event', async () => {
    const user = show('/registrations/new')
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Youth Night')
    await pickDate(user, screen.getByRole('button', { name: 'Date 1' }), '2026-11-21')
    await pickTime(user, screen.getByRole('button', { name: 'Date 1 starts' }), '18:30')
    await user.click(screen.getByRole('button', { name: /Add an agenda/ }))
    await user.type(titleOf(1), 'Doors open')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))

    expect(await screen.findByText('event page e-saved')).toBeInTheDocument()
    expect(state.saved[0].draft.agenda).toEqual([{ id: null, title: 'Doors open', start: '', end: '', details: '', day: null }])
  })

  it('takes a time and a line of detail when they are known', async () => {
    const user = show('/registrations/new')
    await user.click(screen.getByRole('button', { name: /Add an agenda/ }))
    const first = screen.getByRole('group', { name: 'Agenda item 1' })
    await user.type(titleOf(1), 'Teaching')
    // An end is shut until there is a start to end.
    expect(within(first).getByRole('button', { name: 'Agenda item 1 ends' })).toBeDisabled()
    await pickTime(user, within(first).getByRole('button', { name: 'Agenda item 1 starts' }), '10:00')
    await pickTime(user, within(first).getByRole('button', { name: 'Agenda item 1 ends' }), '11:15')
    await user.type(within(first).getByRole('textbox', { name: 'Agenda item 1 detail' }), 'Pastor Ama')

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Conference')
    await pickDate(user, screen.getByRole('button', { name: 'Date 1' }), '2026-11-21')
    await pickTime(user, screen.getByRole('button', { name: 'Date 1 starts' }), '09:00')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await screen.findByText('event page e-saved')
    expect(state.saved[0].draft.agenda).toEqual([{ id: null, title: 'Teaching', start: '10:00', end: '11:15', details: 'Pastor Ama', day: null }])
  })

  it('will not save an item with no title, and says which', async () => {
    const user = show('/registrations/new')
    await user.click(screen.getByRole('button', { name: /Add an agenda/ }))
    await user.click(screen.getByRole('button', { name: /Add an item/ }))
    await user.type(titleOf(1), 'Worship')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    const problems = screen.getByRole('alert', { name: 'Before this can be saved' })
    expect(within(problems).getByText('Agenda item 2 needs a title, or remove it.')).toBeInTheDocument()
    expect(state.saved).toEqual([])
  })

  it('moves an item up and down, and takes one away', async () => {
    const user = show('/registrations/new')
    await user.click(screen.getByRole('button', { name: /Add an agenda/ }))
    await user.click(screen.getByRole('button', { name: /Add an item/ }))
    await user.click(screen.getByRole('button', { name: /Add an item/ }))
    await user.type(titleOf(1), 'Doors')
    await user.type(titleOf(2), 'Worship')
    await user.type(titleOf(3), 'Lunch')
    const order = () => [1, 2, 3].filter((n) => screen.queryByRole('group', { name: `Agenda item ${n}` })).map((n) => (titleOf(n) as HTMLInputElement).value)

    expect(screen.getByRole('button', { name: 'Move agenda item 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move agenda item 3 down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move agenda item 3 up' }))
    expect(order()).toEqual(['Doors', 'Lunch', 'Worship'])
    await user.click(screen.getByRole('button', { name: 'Move agenda item 1 down' }))
    expect(order()).toEqual(['Lunch', 'Doors', 'Worship'])
    await user.click(screen.getByRole('button', { name: 'Remove agenda item 2' }))
    expect(order()).toEqual(['Lunch', 'Worship'])
  })

  it('asks which day only when the event has more than one, and an item on a day goes with that day', async () => {
    const user = show('/registrations/new')
    await user.click(screen.getByRole('button', { name: /Add an agenda/ }))
    await user.type(titleOf(1), 'Workshops')
    // One date: no question to ask.
    expect(screen.queryByRole('combobox', { name: 'Agenda item 1 day' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /Add a date/ }))
    const day = screen.getByRole('combobox', { name: 'Agenda item 1 day' })
    expect(day).toHaveTextContent('Each day')
    await user.click(day)
    await user.click(await screen.findByRole('option', { name: 'Date 2' }))
    expect(screen.getByRole('combobox', { name: 'Agenda item 1 day' })).toHaveTextContent('Date 2')

    // The second date removed: what was on it goes with it.
    await user.click(within(screen.getByRole('group', { name: 'Date 2' })).getByRole('button', { name: 'Remove this date' }))
    expect(screen.queryByRole('group', { name: 'Agenda item 1' })).toBeNull()
    expect(screen.getByText('No agenda yet. An event does not need one.')).toBeInTheDocument()
  })

  it('opens an event with the agenda it was saved with', async () => {
    state.existing = {
      ...full(),
      agenda: [
        { id: 'a1', event_id: 'e1', date_id: null, sort_order: 0, title: 'Doors open', details: null, starts: '18:00', ends: null },
        { id: 'a2', event_id: 'e1', date_id: null, sort_order: 1, title: 'Teaching', details: 'Pastor Ama', starts: '18:30', ends: '19:45' },
      ],
    }
    show('/registrations/e1/edit')
    expect(await screen.findByDisplayValue('Doors open')).toBeInTheDocument()
    expect(titleOf(2)).toHaveValue('Teaching')
    expect(screen.getByRole('textbox', { name: 'Agenda item 2 detail' })).toHaveValue('Pastor Ama')
    expect(screen.getByRole('button', { name: /Add an item/ })).toBeInTheDocument()
  })
})


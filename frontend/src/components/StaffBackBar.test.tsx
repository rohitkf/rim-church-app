import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StaffBackBar } from './StaffBackBar'

/*
 * The way back from somebody's ticket, for whoever runs registrations
 * (the Owner, November 2026): a ticket is a public page with no menu,
 * and in the installed app the only way out of one was to close the app.
 * The attendee whose ticket it is must never be shown it.
 */

const state = vi.hoisted(() => ({
  session: null as unknown,
  opens: [] as string[],
  settled: true,
  /** How many times the page-access questions were put: never, for a visitor. */
  accessAsked: 0,
  event: { id: 'ev-1' } as unknown,
  eventAsked: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: state.session }) }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => {
    state.accessAsked += 1
    return { standing: 'member', settled: state.settled, canOpen: (path: string) => state.opens.includes(path) }
  },
}))
vi.mock('../lib/registrations', () => ({
  ticketEventKey: (slug: string) => ['ticket-agenda', slug],
  fetchPublicEvent: (slug: string) => {
    state.eventAsked.push(slug)
    return state.event instanceof Error ? Promise.reject(state.event) : Promise.resolve(state.event)
  },
}))

function show(props: { eventId?: string; officeOnly?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StaffBackBar slug="conference-2026" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.session = { user: { id: 'u1' } }
  state.opens = []
  state.settled = true
  state.accessAsked = 0
  state.event = { id: 'ev-1' }
  state.eventAsked = []
})

describe('StaffBackBar', () => {
  it('shows nothing to a visitor, and asks nothing about them', () => {
    state.session = null
    state.opens = ['/registrations', '/door']
    const { container } = show()
    expect(container).toBeEmptyDOMElement()
    expect(state.accessAsked).toBe(0)
    expect(state.eventAsked).toEqual([])
  })

  it('shows nothing to somebody signed in who may open neither page — the attendee with an account', async () => {
    const { container } = show()
    expect(container).toBeEmptyDOMElement()
    expect(state.eventAsked).toEqual([])
  })

  it('takes whoever may open Registrations back to this event’s registrations', async () => {
    state.opens = ['/registrations']
    show()
    const nav = screen.getByRole('navigation', { name: 'For the team' })
    await waitFor(() => expect(screen.getByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations/ev-1'))
    expect(state.eventAsked).toEqual(['conference-2026'])
    expect(screen.queryByRole('link', { name: /Reception/ })).toBeNull()
    expect(nav).toHaveTextContent('Only the team sees this bar.')
  })

  it('goes to the list of events while the event is not known, or cannot be found', async () => {
    state.opens = ['/registrations']
    state.event = new Error('no network')
    show()
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations')
    await waitFor(() => expect(state.eventAsked).toEqual(['conference-2026']))
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations')
  })

  it('takes somebody who only works the door back to Reception, on this event', async () => {
    state.opens = ['/door']
    show()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Back to Reception' })).toHaveAttribute('href', '/door?event=ev-1'))
    expect(screen.queryByRole('link', { name: 'Back to registrations' })).toBeNull()
  })

  it('offers both to somebody who may open both, registrations first', async () => {
    state.opens = ['/registrations', '/door']
    show()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Reception' })).toHaveAttribute('href', '/door?event=ev-1'))
    const links = screen.getAllByRole('link').map((a) => a.textContent)
    expect(links).toEqual(['←Back to registrations', 'Reception'])
  })

  it('on the registration page is for whoever runs registrations and nobody else', async () => {
    // The Owner: "the same link … when I open the registration link as well (owner and admins only)".
    state.opens = ['/door']
    const door = show({ officeOnly: true, eventId: 'ev-7' })
    expect(door.container).toBeEmptyDOMElement()
    door.unmount()

    state.opens = ['/registrations', '/door']
    show({ officeOnly: true, eventId: 'ev-7' })
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations/ev-7')
    // Somebody who may open both still has Reception beside it, as on a ticket.
    expect(screen.getByRole('link', { name: 'Reception' })).toHaveAttribute('href', '/door?event=ev-7')
  })

  it('asks nothing more where the page already knows its event', () => {
    state.opens = ['/registrations']
    show({ eventId: 'ev-7' })
    expect(screen.getByRole('link', { name: 'Back to registrations' })).toHaveAttribute('href', '/registrations/ev-7')
    expect(state.eventAsked).toEqual([])
  })

  it('waits for the answer rather than guessing: nothing while who they are is still loading', () => {
    state.opens = ['/registrations']
    state.settled = false
    const { container } = show()
    expect(container).toBeEmptyDOMElement()
    expect(state.eventAsked).toEqual([])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { ServiceSections } from './ServiceSections'

vi.mock('../lib/appSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/appSettings')>()
  const { readDisplay } = await import('../lib/display')
  return { ...actual, useAppSettings: () => actual.DEFAULT_SETTINGS, useDisplay: () => readDisplay({}) }
})

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

/*
 * Every page that lists services shows the Finished ones under the same
 * heading, so the countdown to their deletion (0128) is said once, there,
 * for all of them.
 */
// Every page that lists services is behind the router, and the list reads its address.
const show = (ui: ReactElement, at = '/rota') => render(<MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter>)

describe('the Finished services countdown', () => {
  it('says when the oldest finished service is deleted, even while the list is shut', () => {
    show(
      <ServiceSections
        sections={{ today: [], next: [], upcoming: [], finished: [{ id: 'a', date: day(-3) }, { id: 'b', date: day(-11) }] }}
        render={(services) => services.map((s) => <p key={s.id}>{s.date}</p>)}
        finishedId="finished"
      />,
    )
    // Fourteen days after its date, at the start of the next day: 11 days
    // ago leaves a little over three.
    expect(screen.getByText(/Each is deleted 14 days after its date, with everything about it — the oldest here goes in [34] days\./)).toBeInTheDocument()
  })

  it('says nothing when nothing has finished', () => {
    show(
      <ServiceSections
        sections={{ today: [], next: [{ id: 'n', date: day(3) }], upcoming: [], finished: [] }}
        render={(services) => services.map((s) => <p key={s.id}>{s.date}</p>)}
        finishedId="finished"
      />,
    )
    expect(screen.queryByText(/Each is deleted/)).toBeNull()
  })
})

/*
 * One service, asked for by the address (lib/serviceLinks): a link from
 * its running order lands on it, whichever folded section it is in.
 */
describe('a page asked for one service', () => {
  const sections = {
    today: [],
    next: [{ id: 'n', date: day(3) }],
    upcoming: [{ id: 'u', date: day(10) }],
    finished: [{ id: 'f', date: day(-3) }],
  }
  const list = (at: string) =>
    show(
      <ServiceSections
        sections={sections}
        render={(services) => services.map((s) => <p key={s.id}>service {s.id}</p>)}
        finishedId="finished"
      />,
      at,
    )
  const folded = (label: RegExp) => screen.getByRole('button', { name: label })

  it('keeps Upcoming and Finished folded when nothing was asked for', () => {
    list('/rota')
    expect(folded(/Upcoming services/)).toHaveAttribute('aria-expanded', 'false')
    expect(folded(/Finished services/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens Upcoming for a service in it, and leaves Finished shut', () => {
    list('/rota?service=u')
    expect(folded(/Upcoming services/)).toHaveAttribute('aria-expanded', 'true')
    expect(folded(/Finished services/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens Finished for a service that is over', () => {
    list('/rota?service=f')
    expect(folded(/Finished services/)).toHaveAttribute('aria-expanded', 'true')
    expect(folded(/Upcoming services/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('says so when the page does not list that service, and nothing otherwise', () => {
    list('/rota?service=n')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says the service is not on this page when it is further off than the page lists', () => {
    list('/rota?service=gone')
    expect(screen.getByRole('status')).toHaveTextContent('The service you came from is not on this page')
  })
})

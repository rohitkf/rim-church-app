import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
describe('the Finished services countdown', () => {
  it('says when the oldest finished service is deleted, even while the list is shut', () => {
    render(
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
    render(
      <ServiceSections
        sections={{ today: [], next: [{ id: 'n', date: day(3) }], upcoming: [], finished: [] }}
        render={(services) => services.map((s) => <p key={s.id}>{s.date}</p>)}
        finishedId="finished"
      />,
    )
    expect(screen.queryByText(/Each is deleted/)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TodayEvents } from './TodayEvents'
import type { EventToday } from '../lib/churchEvents'

const event = (over: Partial<EventToday> & { id: string; title: string }): EventToday => ({
  time: null,
  location: null,
  team: null,
  color: null,
  details: null,
  link: null,
  day: null,
  ...over,
})

const show = (events: EventToday[]) =>
  render(
    <MemoryRouter>
      <TodayEvents events={events} />
    </MemoryRouter>,
  )

describe('the banner for what is on today', () => {
  /*
   * A banner that says "nothing on today" every day is a banner people
   * learn to scroll past, so on the one morning it has something to say
   * nobody reads it.
   */
  it('is not there at all on a day with nothing on', () => {
    const { container } = show([])
    expect(container).toBeEmptyDOMElement()
  })

  it('says what it is, when, where and whose', () => {
    show([
      event({
        id: 'e1',
        title: 'Night of Worship',
        time: '7:00pm',
        location: 'Main hall',
        team: 'Worship',
      }),
    ])
    expect(screen.getByText('Night of Worship')).toBeInTheDocument()
    expect(screen.getByText('7:00pm · Main hall · Worship')).toBeInTheDocument()
  })

  it('says which day of a run this is, so three days do not read as three events', () => {
    show([event({ id: 'e1', title: 'Week of Prayer', day: { nth: 3, of: 7 } })])
    expect(screen.getByText('Day 3 of 7')).toBeInTheDocument()
  })

  it('lists everything on, not just the first thing', () => {
    show([
      event({ id: 'e1', title: 'Morning Prayer' }),
      event({ id: 'e2', title: 'Youth Night' }),
    ])
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByLabelText('2 things on today')).toBeInTheDocument()
  })

  it('points at the diary for everything it is not showing', () => {
    show([event({ id: 'e1', title: 'Baptism Service' })])
    expect(screen.getByRole('link', { name: /Church diary/ })).toHaveAttribute('href', '/events')
  })

  /*
   * The sky is decoration and nothing else: three layers that a screen
   * reader must never read out, and that no touch can land on.
   */
  it('hides the galaxy from anyone not looking at it', () => {
    const { container } = show([event({ id: 'e1', title: 'Baptism Service' })])
    const sky = container.querySelectorAll('.galaxy-glow, .galaxy-stars')
    expect(sky).toHaveLength(3)
    for (const layer of sky) expect(layer).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('going from the banner to the event', () => {
  it('has a button straight to the link, when the event has one', () => {
    show([event({ id: 'e1', title: 'Prophetical Prayer', link: 'https://us02web.zoom.us/j/1' })])
    const open = screen.getByRole('link', { name: /Open link/ })
    expect(open).toHaveAttribute('href', 'https://us02web.zoom.us/j/1')
    expect(open).toHaveAttribute('target', '_blank')
  })

  it('has no link button when there is no link', () => {
    show([event({ id: 'e1', title: 'Workday' })])
    expect(screen.queryByRole('link', { name: /Open link/ })).toBeNull()
  })

  it('opens the event itself on the Events page', () => {
    show([event({ id: 'e1', title: 'Workday' })])
    expect(screen.getByRole('link', { name: 'View Workday' })).toHaveAttribute('href', '/events?event=e1')
  })
})

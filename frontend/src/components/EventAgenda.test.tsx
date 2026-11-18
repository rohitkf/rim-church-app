import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EventAgenda } from './EventAgenda'
import { formatDateValue, formatTimeValue } from '../lib/dateTimeFormat'
import type { PublicAgendaItem, PublicDate } from '../lib/registrations'

/*
 * An event's agenda on its public page (0303): what happens, in the order
 * it was written, with the time beside it where there is one.
 */

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const line = (over: Partial<PublicAgendaItem>): PublicAgendaItem => ({
  id: over.title ?? 'a',
  date_id: null,
  title: 'Worship',
  details: null,
  starts: null,
  ends: null,
  ...over,
})

const oneDay: PublicDate[] = [{ id: 'd1', starts_at: at(2026, 11, 21, 9, 0), ends_at: null, label: null }]
const twoDays: PublicDate[] = [
  { id: 'd1', starts_at: at(2026, 11, 20, 9, 0), ends_at: null, label: 'Day 1' },
  { id: 'd2', starts_at: at(2026, 11, 21, 9, 0), ends_at: null, label: 'Day 2' },
]

describe('an event’s agenda', () => {
  it('is not drawn at all for an event with none', () => {
    const { container } = render(<EventAgenda agenda={[]} dates={oneDay} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists what happens in the order it was written, not the order of its times', () => {
    render(
      <EventAgenda
        dates={oneDay}
        agenda={[line({ title: 'Lunch', starts: '13:00' }), line({ title: 'Announcements' }), line({ title: 'Doors open', starts: '09:00' })]}
      />,
    )
    expect(screen.getByText('Agenda')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => within(li).getByText(/Lunch|Announcements|Doors open/).textContent)).toEqual([
      'Lunch',
      'Announcements',
      'Doors open',
    ])
  })

  it('says the time beside an item that has one, the end with it, and the detail under the title', () => {
    render(
      <EventAgenda
        dates={oneDay}
        agenda={[line({ title: 'Teaching', starts: '10:00', ends: '11:15', details: 'Pastor Ama, main hall' }), line({ title: 'Lunch' })]}
      />,
    )
    const [teaching, lunch] = screen.getAllByRole('listitem')
    expect(teaching).toHaveTextContent(formatTimeValue('10:00'))
    expect(teaching).toHaveTextContent(formatTimeValue('11:15'))
    expect(within(teaching).getByText('Pastor Ama, main hall')).toBeInTheDocument()
    // No time is no time: nothing is made up for it.
    expect(within(lunch).queryByRole('time')).toBeNull()
    expect(lunch.querySelector('time')).toBeNull()
  })

  it('draws no time column when nothing on the agenda has a time', () => {
    render(<EventAgenda dates={oneDay} agenda={[line({ title: 'Worship' }), line({ title: 'Lunch' })]} />)
    expect(document.querySelector('time')).toBeNull()
    expect(document.querySelector('.tabular')).toBeNull()
  })

  it('has no day headings for an event that names no day', () => {
    render(<EventAgenda dates={oneDay} agenda={[line({ title: 'Worship' })]} />)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('sets a several-day event out a day at a time, what is on each day first under "Each day"', () => {
    render(
      <EventAgenda
        dates={twoDays}
        agenda={[
          line({ title: 'Workshops', date_id: 'd2' }),
          line({ title: 'Registration desk' }),
          line({ title: 'Opening night', date_id: 'd1' }),
        ]}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toBe('Each day')
    // The day in the reader's own words, whatever they are, and its label.
    expect(headings[1]).toBe(`${formatDateValue('2026-11-20')} · Day 1`)
    expect(headings[2]).toBe(`${formatDateValue('2026-11-21')} · Day 2`)
    const blocks = screen.getAllByRole('region')
    expect(within(blocks[1]).getByText('Opening night')).toBeInTheDocument()
    expect(within(blocks[2]).getByText('Workshops')).toBeInTheDocument()
  })
})

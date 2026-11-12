import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArrivalChart, ArrivalStrip } from './ArrivalChart'
import { arrivalWords } from '../lib/arrivalWords'
import type { Arrival } from '../lib/clockInPunctuality'

/*
 * One person's clock-ins against their call time (0280): a bar a
 * clock-in, a readout for the one being looked at, and nothing said in
 * colour alone.
 */

const arrival = (day: string, clocked: string, call: string | null, lateAfter = 30): Arrival => {
  const clocked_at = `${day}T${clocked}:00Z`
  const call_at = call ? `${day}T${call}:00Z` : null
  const minutes = call_at ? Math.round((Date.parse(clocked_at) - Date.parse(call_at)) / 60_000) : null
  return { on_date: day, clocked_at, call_at, minutes, late: minutes !== null && minutes >= lateAfter }
}

// 18 October is still summer time in London: 07:48 and 08:00 UTC read 08:48 and 09:00 on the church's clock.
const arrivals = [
  arrival('2026-10-18', '07:48', '08:00'),
  arrival('2026-10-25', '08:47', '08:00'),
  arrival('2026-11-01', '10:00', null),
  arrival('2026-11-08', '08:05', '08:00'),
]

/** A day as the browser's own locale writes it: "25 Oct" or "Oct 25". */
const day = (d: number, month: string) => `(?:${d} ${month}|${month} ${d})`
const said = (text: string) => new RegExp(text)

const draw = (list = arrivals) => render(<ArrivalChart arrivals={list} lateAfter={30} timeZone="Europe/London" name="Joel Skaria" />)

describe('a day in words', () => {
  it('gives the day, both times, how it fell, and says late when it was', () => {
    expect(arrivalWords(arrivals[1], 'Europe/London')).toMatch(said(`${day(25, 'Oct')} · clocked in 08:47 · call 08:00 · 47 min after call, late$`))
    expect(arrivalWords(arrivals[0], 'Europe/London')).toMatch(said(`${day(18, 'Oct')} · clocked in 08:48 · call 09:00 · 12 min before call$`))
  })

  it('says the call time is not known rather than leave it out', () => {
    expect(arrivalWords(arrivals[2], 'Europe/London')).toMatch(said(`${day(1, 'Nov')} · clocked in 10:00 · call time not known$`))
  })
})

describe('the arrivals chart', () => {
  it('is named for the person, and has a bar a clock-in that says its day in full', () => {
    draw()
    const chart = screen.getByRole('figure', { name: 'Joel Skaria: clock-ins against call time' })
    const bars = within(chart).getAllByRole('button')
    expect(bars).toHaveLength(4)
    expect(bars[1]).toHaveAccessibleName(said(`${day(25, 'Oct')} · clocked in 08:47 · call 08:00 · 47 min after call, late`))
  })

  it('reads out the latest clock-in until one is picked', () => {
    draw()
    expect(screen.getByText(said(`${day(8, 'Nov')} · clocked in 08:05 · call 08:00 · 5 min after call$`))).toBeInTheDocument()
  })

  it('reads out the bar that is pressed, focused or pointed at', async () => {
    draw()
    const bars = screen.getAllByRole('button')
    await userEvent.click(bars[1])
    expect(screen.getByText(said(`${day(25, 'Oct')} · clocked in 08:47 · call 08:00 · 47 min after call, late`), { selector: 'span' })).toBeInTheDocument()
    expect(bars[1]).toHaveAttribute('aria-pressed', 'true')
    await userEvent.tab()
    expect(screen.getByText(said(`${day(1, 'Nov')} · clocked in 10:00 · call time not known`), { selector: 'span' })).toBeInTheDocument()
    await userEvent.hover(bars[0])
    expect(screen.getByText(said(`${day(18, 'Oct')} · clocked in 08:48 · call 09:00 · 12 min before call`), { selector: 'span' })).toBeInTheDocument()
  })

  it('names both states in a legend, with the church’s number, so red is never the only sign', () => {
    draw()
    expect(screen.getByText('On time')).toBeInTheDocument()
    expect(screen.getByText('Late: 30 min or more after call')).toBeInTheDocument()
    // And where late begins is marked on the scale.
    expect(screen.getByText('Late')).toBeInTheDocument()
  })

  it('explains the ring only when there is one: a call time not known', () => {
    draw()
    expect(screen.getByText('Call time not known')).toBeInTheDocument()
    draw([arrivals[0], arrivals[1]])
    expect(screen.getAllByText('Call time not known')).toHaveLength(1)
  })

  it('moves the late line with the church’s number', () => {
    render(<ArrivalChart arrivals={arrivals} lateAfter={45} timeZone="Europe/London" name="Joel Skaria" />)
    expect(screen.getByText('Late: 45 min or more after call')).toBeInTheDocument()
    expect(screen.getByText('Late')).toBeInTheDocument()
  })

  it('leaves the mark off the scale where it would sit on another one; the legend still says it', () => {
    render(<ArrivalChart arrivals={arrivals} lateAfter={60} timeZone="Europe/London" name="Joel Skaria" />)
    expect(screen.queryByText('Late')).toBeNull()
    expect(screen.getByText('Late: 60 min or more after call')).toBeInTheDocument()
  })

  it('labels every day when there are few, and only the first and last when there are many', () => {
    const { unmount } = draw()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    unmount()
    const many = Array.from({ length: 12 }, (_, i) => arrival(`2026-10-${String(10 + i).padStart(2, '0')}`, '08:05', '08:00'))
    draw(many)
    expect(screen.getByText(/^10 Oct$|^Oct 10$/)).toBeInTheDocument()
    expect(screen.getByText(/^21 Oct$|^Oct 21$/)).toBeInTheDocument()
    expect(screen.queryByText(/^15 Oct$|^Oct 15$/)).toBeNull()
  })

  it('draws a morning far beyond the scale without losing its figure', async () => {
    draw([arrival('2026-11-08', '12:20', '08:00')])
    expect(screen.getByRole('button')).toHaveAccessibleName(/4 h 20 min after call, late/)
  })
})

describe('the strip beside a name', () => {
  it('is a picture only: the words beside it carry the figures', () => {
    const { container } = render(<ArrivalStrip arrivals={arrivals} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the newest fourteen', () => {
    const many = Array.from({ length: 20 }, (_, i) => arrival(`2026-10-${String(10 + i).padStart(2, '0')}`, '08:05', '08:00'))
    const { container } = render(<ArrivalStrip arrivals={many} />)
    // The call line, then a column a clock-in.
    expect(container.firstElementChild?.children).toHaveLength(1 + 14)
  })
})

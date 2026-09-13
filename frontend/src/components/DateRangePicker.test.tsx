import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateRangePicker } from './DateRangePicker'

/*
 * The browser's date field could only ever say one day, and on a phone it
 * says it through a spinning wheel in a grey sheet — no month around it,
 * no way to see which day is a Saturday, and nowhere to add "and the two
 * days after". A church diary is full of things that run.
 */

const TODAY = '2026-09-13'

function show(from = '2026-09-18', to: string | null = null) {
  const onChange = vi.fn()
  render(<DateRangePicker from={from} to={to} today={TODAY} onChange={onChange} />)
  return onChange
}

/** A day in the grid, addressed the way the calendar labels it. */
const day = (iso: string) => screen.getByRole('gridcell', { name: iso })

describe('picking a day, or a run of them', () => {
  it('opens on the month of the day it was given', () => {
    show()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('walks to another month without touching what is chosen', async () => {
    const onChange = show()
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('takes a second press as the end of a run', async () => {
    const onChange = show()
    await userEvent.click(day('2026-09-18'))
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-18', to: null })

    // The picker is controlled, so the parent hands the start back.
    render(<DateRangePicker from="2026-09-18" to={null} today={TODAY} onChange={onChange} />)
  })

  it('reads a press before the start as a correction, not a backwards run', async () => {
    const onChange = vi.fn()
    render(<DateRangePicker from="2026-09-18" to="2026-09-20" today={TODAY} onChange={onChange} />)

    await userEvent.click(day('2026-09-10'))
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-10', to: null })
  })

  it('says the run in words, because a grid of tinted squares is a day out', () => {
    show('2026-09-18', '2026-09-20')
    expect(screen.getByText(/18–20 Sep/)).toBeInTheDocument()
    expect(screen.getByText(/3 days/)).toBeInTheDocument()
  })

  it('adds and removes an end date in one press', async () => {
    const onChange = show('2026-09-18', null)
    await userEvent.click(screen.getByRole('button', { name: 'Add an end date' }))
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-18', to: '2026-09-19' })

    const back = show('2026-09-18', '2026-09-19')
    await userEvent.click(screen.getAllByRole('button', { name: 'Just one day' })[0])
    expect(back).toHaveBeenLastCalledWith({ from: '2026-09-18', to: null })
  })

  it('marks every day of the run, not only its ends', () => {
    show('2026-09-18', '2026-09-20')
    for (const iso of ['2026-09-18', '2026-09-19', '2026-09-20']) {
      expect(day(iso)).toHaveAttribute('aria-pressed', 'true')
    }
    expect(day('2026-09-21')).toHaveAttribute('aria-pressed', 'false')
  })
})

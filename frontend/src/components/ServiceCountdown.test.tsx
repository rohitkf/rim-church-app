import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServiceCountdown } from './ServiceCountdown'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-01T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('a countdown in a line of text', () => {
  // The church asked for the seconds back after they were held still a day
  // or more out: the clock running is the point of it, on every page.
  it('runs to the second even days away', () => {
    render(<ServiceCountdown startsAt="2026-09-05T17:12:30Z" label="to answer" />)
    // The digits roll, so what it says is read from what it speaks.
    expect(screen.getByLabelText(/^4 days 07:12:30 to answer/)).toBeInTheDocument()
  })

  it('runs to the second on the day itself', () => {
    render(<ServiceCountdown startsAt="2026-09-01T11:30:15Z" label="to answer" />)
    expect(screen.getByLabelText(/^01:30:15 to answer/)).toBeInTheDocument()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServiceCountdown } from './ServiceCountdown'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-01T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('a countdown in a line of text', () => {
  it('says days and hours and holds still while it is a day or more away', () => {
    // Four days, seven hours and some minutes out.
    render(<ServiceCountdown startsAt="2026-09-05T17:12:30Z" label="to answer" />)
    expect(screen.getByText('4d 7h')).toBeInTheDocument()
    // No seconds turning on a deadline four days off.
    expect(screen.queryByText(':')).toBeNull()
  })

  it('runs as a clock on the last day, when the minutes matter', () => {
    render(<ServiceCountdown startsAt="2026-09-01T11:30:15Z" label="to answer" />)
    expect(screen.queryByText(/\dd \d+h/)).toBeNull()
    // The digits roll, so what it says is read from what it speaks.
    expect(screen.getByLabelText(/^01:30:15 to answer/)).toBeInTheDocument()
  })
})

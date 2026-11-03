import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Countdown } from './Countdown'

describe('the countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('ticks down, drops the days on the last one, and says when it is over', () => {
    render(<Countdown to="2026-11-05T12:00:03Z" lead="Registration closes in" over="Registration has closed." />)
    expect(screen.getByRole('timer')).toHaveAccessibleName('Registration closes in 2 days 0 hrs 0 min 3 sec')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('timer')).toHaveAccessibleName('Registration closes in 2 days 0 hrs 0 min 2 sec')
    act(() => vi.setSystemTime(new Date('2026-11-05T10:00:00Z')))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('timer')).toHaveAccessibleName(/^Registration closes in 2 hrs 0 min 2 sec$/)
    act(() => vi.setSystemTime(new Date('2026-11-05T12:00:04Z')))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.getByText('Registration has closed.')).toBeInTheDocument()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { RailCountdown } from './Timeline'

const NOW = new Date('2026-09-06T12:44:00.000Z').getTime()
const inSeconds = (n: number) => new Date(NOW + n * 1000).toISOString()

describe('RailCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('counts down every second', () => {
    render(<RailCountdown startsAt={inSeconds(190)} />)
    expect(screen.getByText('3m 10s')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.getByText('3m 05s')).toBeInTheDocument()
  })

  it('counts the seconds with more than an hour to go, too', () => {
    render(<RailCountdown startsAt={inSeconds(89 * 60 + 14)} />)
    expect(screen.getByText('1:29:14')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByText('1:29:11')).toBeInTheDocument()
    expect(screen.getByLabelText('Next session in 1:29:11')).toBeInTheDocument()
  })

  it('shows a long overrun to the second as well', () => {
    render(<RailCountdown startsAt={inSeconds(-(61 * 60 + 5))} holding />)
    expect(screen.getByText('+1:01:05')).toBeInTheDocument()
    expect(screen.getByLabelText('Running 1:01:05 over')).toBeInTheDocument()
  })

  it('turns over to bare seconds at the last minute', () => {
    render(<RailCountdown startsAt={inSeconds(61)} />)
    act(() => void vi.advanceTimersByTime(2000))
    expect(screen.getByText('59s')).toBeInTheDocument()
  })

  it('says due rather than counting into the negative', () => {
    render(<RailCountdown startsAt={inSeconds(2)} />)
    act(() => void vi.advanceTimersByTime(4000))
    expect(screen.getByText('due')).toBeInTheDocument()
    expect(screen.getByLabelText('The next session is due to start')).toBeInTheDocument()
  })

  it('reads as a sentence for a screen reader, not a bare number', () => {
    render(<RailCountdown startsAt={inSeconds(190)} />)
    expect(screen.getByLabelText('Next session in 3m 10s')).toBeInTheDocument()
  })

  it('stops ticking once it is off the page', () => {
    const { unmount } = render(<RailCountdown startsAt={inSeconds(190)} />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

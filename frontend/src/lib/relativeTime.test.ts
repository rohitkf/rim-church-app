import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime } from './relativeTime'

const NOW = new Date('2026-01-01T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatRelativeTime', () => {
  it('says "just now" for timestamps under ~30s old (rounds to 0 minutes)', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 10_000).toISOString())).toBe('just now')
  })

  it('formats singular minute correctly', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 60_000).toISOString())).toBe('1 min ago')
  })

  it('formats plural minutes correctly', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000).toISOString())).toBe('5 mins ago')
  })

  it('formats singular hour correctly', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 60 * 60_000).toISOString())).toBe('1 hour ago')
  })

  it('formats plural hours correctly', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString())).toBe('3 hours ago')
  })

  it('formats plural days correctly', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString())).toBe('2 days ago')
  })
})

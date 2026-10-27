import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { usePrayerLive } from './usePrayerLive'

/*
 * The Prayer page refetches when the database says something changed, on
 * a private broadcast topic — never on row data, which nobody may read.
 */

const realtime = vi.hoisted(() => ({
  opened: [] as { name: string; config: unknown }[],
  handler: null as null | (() => void),
  removed: 0,
}))

vi.mock('./supabaseClient', () => ({
  supabase: {
    channel: (name: string, config: unknown) => {
      realtime.opened.push({ name, config })
      const channel = {
        on: (_type: string, _filter: unknown, handler: () => void) => {
          realtime.handler = handler
          return channel
        },
        subscribe: () => channel,
      }
      return channel
    },
    removeChannel: () => {
      realtime.removed += 1
      return Promise.resolve()
    },
  },
}))

/** What the browser says about whether anybody is looking. */
function looking(visible: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  vi.useFakeTimers()
  realtime.opened = []
  realtime.handler = null
  realtime.removed = 0
})
afterEach(() => vi.useRealTimers())

describe('Prayer Requests, live', () => {
  it('listens on the private prayer topic, and refetches the board once for a burst of changes', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { unmount } = renderHook(() => usePrayerLive(), { wrapper })
    expect(realtime.opened).toEqual([{ name: 'prayer', config: { config: { private: true } } }])
    realtime.handler!()
    realtime.handler!()
    realtime.handler!()
    vi.advanceTimersByTime(300)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['prayer-board'] })
    unmount()
    expect(realtime.removed).toBe(1)
  })

  it('stops listening a minute after the phone is put down, and catches up when it is looked at again', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { unmount } = renderHook(() => usePrayerLive(), { wrapper })

    // A glance away is not enough to drop it.
    looking(false)
    vi.advanceTimersByTime(30_000)
    looking(true)
    expect(realtime.removed).toBe(0)
    expect(realtime.opened).toHaveLength(1)
    expect(invalidate).not.toHaveBeenCalled()

    looking(false)
    vi.advanceTimersByTime(60_000)
    expect(realtime.removed).toBe(1)

    looking(true)
    expect(realtime.opened).toHaveLength(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['prayer-board'] })

    unmount()
    expect(realtime.removed).toBe(2)
  })
})

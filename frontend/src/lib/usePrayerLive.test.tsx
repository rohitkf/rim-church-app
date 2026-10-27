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

beforeEach(() => {
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
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useLiveData } from './useLiveData'
import { LIVE_TABLES, keysFor } from './liveTables'

/** The bindings the hook asked for, and the handler each was given. */
const bound: { table: string; fire: () => void }[] = []
const removeChannel = vi.fn()
const subscribe = vi.fn()

vi.mock('./supabaseClient', () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (_event: string, filter: { table: string }, handler: () => void) => {
          bound.push({ table: filter.table, fire: handler })
          return channel
        },
        subscribe,
      }
      return channel
    },
    removeChannel: (...args: unknown[]) => removeChannel(...args),
  },
}))

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useLiveData(), { wrapper })
  return { ...view, invalidate }
}

const fire = (table: string) => bound.find((b) => b.table === table)!.fire()

/** The first element of every key the client was asked to invalidate. */
const askedFor = (invalidate: { mock: { calls: unknown[][] } }): string[] =>
  invalidate.mock.calls.map((call) => ((call[0] as { queryKey: string[] }).queryKey ?? [])[0])

beforeEach(() => {
  bound.length = 0
  removeChannel.mockReset()
  subscribe.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

describe('useLiveData', () => {
  it('listens to every table on one channel, and opens it', () => {
    harness()
    expect(bound.map((b) => b.table).sort()).toEqual(LIVE_TABLES.map((t) => t.table).sort())
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('marks the queries that were reading a table as stale', async () => {
    const { invalidate } = harness()
    fire('rota_assignments')
    await vi.advanceTimersByTimeAsync(200)

    const asked = askedFor(invalidate)
    for (const key of keysFor('rota_assignments')) expect(asked).toContain(key)
  })

  it('leaves untouched tables alone', async () => {
    const { invalidate } = harness()
    fire('inventory_items')
    await vi.advanceTimersByTimeAsync(200)

    const asked = askedFor(invalidate)
    expect(asked).toContain('inventory-items')
    expect(asked).not.toContain('rota')
  })

  it('collects a burst into one round rather than one refetch per row', async () => {
    // Saving a plan writes a dozen sessions in one statement.
    const { invalidate } = harness()
    for (let i = 0; i < 12; i += 1) fire('service_sessions')
    await vi.advanceTimersByTimeAsync(200)

    const asked = askedFor(invalidate)
    expect(asked.length).toBe(keysFor('service_sessions').length)
    expect(new Set(asked).size).toBe(asked.length)
  })

  it('says nothing until the burst has settled', async () => {
    const { invalidate } = harness()
    fire('availability')
    await vi.advanceTimersByTimeAsync(50)
    expect(invalidate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)
    expect(invalidate).toHaveBeenCalled()
  })

  it('closes the socket when the app shell goes', () => {
    const { unmount } = harness()
    unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })

  it('drops a pending burst on the way out rather than firing into a dead client', async () => {
    const { invalidate, unmount } = harness()
    fire('services')
    unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('the table map', () => {
  it('names every table once', () => {
    const names = LIVE_TABLES.map((t) => t.table)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every table at least one query to invalidate', () => {
    for (const { table, keys } of LIVE_TABLES) {
      expect(keys.length, table).toBeGreaterThan(0)
      expect(new Set(keys).size, table).toBe(keys.length)
    }
  })

  it('says nothing for a table nobody is watching', () => {
    expect(keysFor('push_subscriptions')).toEqual([])
    expect(keysFor('profile_sensitive')).toEqual([])
  })

  /*
   * The failure this file exists to catch.
   *
   * A key here is a string, matched against a string somewhere else. Rename
   * a query — 'rota-progress' to 'checklist-progress', say — and nothing
   * breaks, nothing fails to compile, and the page it belongs to quietly
   * stops updating itself. Nobody would find that for months, and when
   * they did they would report it as "it sometimes doesn't refresh".
   *
   * So the map is checked against the queries that actually exist, by
   * reading them out of the source.
   */
  it('names only query keys the app actually uses', () => {
    // Vite reads the sources for us, so this needs no filesystem and no
    // node types — and it sees exactly the files that get bundled.
    const sources = import.meta.glob('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    const used = new Set<string>()
    for (const [path, source] of Object.entries(sources)) {
      if (/\.test\./.test(path)) continue
      // `queryKey: ['rota', id]` and `const SETTINGS_KEY = ['app-settings']`.
      for (const [, key] of source.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)) used.add(key)
      for (const [, key] of source.matchAll(/_KEY\s*=\s*\[\s*'([^']+)'/g)) used.add(key)
    }
    // The scan has to have found something, or this test passes by finding
    // nothing and comparing nothing.
    expect(used.size).toBeGreaterThan(40)

    const unknown = LIVE_TABLES.flatMap(({ table, keys }) =>
      keys.filter((key) => !used.has(key)).map((key) => `${table} → ${key}`),
    )
    expect(unknown).toEqual([])
  })
})

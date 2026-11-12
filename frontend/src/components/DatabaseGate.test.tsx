import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DatabaseGate } from './DatabaseGate'
import { BEHIND_ASKS_EVERY_MS, DATABASE_VERSION_KEY, OPEN_ANYWAY_AFTER_MS } from '../lib/databaseVersion'
import { SCHEMA_NEEDS } from '../lib/schemaNeeds'
import appSource from '../App.tsx?raw'

/*
 * The app, or the page that says it is being updated while the database
 * is behind this build (0285).
 */

const version = vi.hoisted(() => vi.fn<() => Promise<number | null>>())
vi.mock('../lib/databaseVersion', async (original) => ({
  ...(await original<typeof import('../lib/databaseVersion')>()),
  fetchDatabaseVersion: () => version(),
}))

let client: QueryClient
function show() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DatabaseGate>
        <p>the app</p>
      </DatabaseGate>
    </QueryClientProvider>,
  )
}
/** Let what is waiting happen, then move the clock on. */
const pass = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  version.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('while nothing is known', () => {
  it('draws the app at once and does not wait on the answer', async () => {
    version.mockReturnValue(new Promise(() => {}))
    show()
    expect(screen.getByText('the app')).toBeInTheDocument()
    await pass(60_000)
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('draws the app when the database could not say', async () => {
    version.mockResolvedValue(null)
    show()
    await pass(10)
    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(screen.queryByText('The app is being updated')).not.toBeInTheDocument()
  })
})

describe('when the database has caught up, or is ahead', () => {
  it('draws the app', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS)
    show()
    await pass(10)
    expect(screen.getByText('the app')).toBeInTheDocument()
    version.mockResolvedValue(SCHEMA_NEEDS + 2)
    await act(async () => {
      await client.invalidateQueries({ queryKey: DATABASE_VERSION_KEY })
    })
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('does not go on asking', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS)
    show()
    await pass(10)
    await pass(BEHIND_ASKS_EVERY_MS * 4)
    expect(version).toHaveBeenCalledTimes(1)
  })
})

describe('when the database is behind', () => {
  it('says the app is being updated, in place of all of it', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS - 1)
    show()
    await pass(10)
    expect(screen.getByRole('heading', { name: 'The app is being updated' })).toBeInTheDocument()
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
    expect(screen.getByText(/Nothing of yours is lost/)).toBeInTheDocument()
  })

  it('asks again by itself, and gives the app back the moment the answer changes', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS - 1)
    show()
    await pass(10)
    expect(version).toHaveBeenCalledTimes(1)
    await pass(BEHIND_ASKS_EVERY_MS)
    expect(version).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'The app is being updated' })).toBeInTheDocument()
    version.mockResolvedValue(SCHEMA_NEEDS)
    await pass(BEHIND_ASKS_EVERY_MS)
    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(screen.queryByText('The app is being updated')).not.toBeInTheDocument()
  })

  it('asks at once when somebody presses Try now', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS - 1)
    show()
    await pass(10)
    version.mockResolvedValue(SCHEMA_NEEDS)
    await act(async () => {
      screen.getByRole('button', { name: 'Try now' }).click()
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('opens the app to an answer that could not be read, rather than keep people out on a guess', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS - 1)
    show()
    await pass(10)
    version.mockResolvedValue(null)
    await pass(BEHIND_ASKS_EVERY_MS)
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('offers the way past only to somebody who has waited', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS - 1)
    show()
    await pass(10)
    expect(screen.queryByRole('button', { name: 'Open the app anyway' })).not.toBeInTheDocument()
    await pass(OPEN_ANYWAY_AFTER_MS + 100)
    expect(screen.getByRole('button', { name: 'Open the app anyway' })).toBeInTheDocument()
  })

  it('lets them in when they take it, and keeps them in while the database is still behind', async () => {
    version.mockResolvedValue(SCHEMA_NEEDS - 1)
    show()
    await pass(10)
    await pass(OPEN_ANYWAY_AFTER_MS + 100)
    await act(async () => {
      screen.getByRole('button', { name: 'Open the app anyway' }).click()
    })
    expect(screen.getByText('the app')).toBeInTheDocument()
    await pass(BEHIND_ASKS_EVERY_MS * 3)
    expect(screen.getByText('the app')).toBeInTheDocument()
  })
})

describe('where it stands in the app', () => {
  it('is around the router, so the sign-in and registration pages are inside it', () => {
    expect(appSource).toMatch(/<DatabaseGate>\s*<RouterProvider router=\{router\} \/>\s*<\/DatabaseGate>/)
  })

  it('is asked again when the database says something does not exist', () => {
    expect(appSource).toContain('if (isDatabaseFault(error)) void queryClient.invalidateQueries({ queryKey: DATABASE_VERSION_KEY })')
    expect(appSource.match(/askDatabaseVersionAgain\(error\)/g)).toHaveLength(2)
  })
})

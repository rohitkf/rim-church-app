import { vi } from 'vitest'
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AppSettings } from '../lib/appSettings'

/**
 * A stand-in for the one app_settings row, for the Settings rooms' tests:
 * reads hand back `row`, and every update is recorded in `writes`.
 *
 *   vi.mock('../lib/supabaseClient', async () => (await import('../test/settingsRow')).settingsRowMock())
 *   beforeEach(() => settingsRow.reset({ ...DEFAULT_SETTINGS }))
 *
 * It imports nothing that reaches the Supabase client — a mock factory
 * that imports a module which imports the module being mocked waits on
 * itself for ever, and the test hangs rather than fails.
 */
export const settingsRow = {
  row: {} as AppSettings,
  writes: [] as Record<string, unknown>[],
  reset(row: AppSettings) {
    this.row = { ...row }
    this.writes = []
  },
}

export function settingsRowMock() {
  return {
    supabase: {
      from: () => ({
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { ...settingsRow.row }, error: null }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            settingsRow.writes.push(patch)
            return Promise.resolve({ error: null })
          },
        }),
      }),
    },
  }
}

export function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

export const adminAuth = () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }),
})

void vi

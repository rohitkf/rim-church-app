import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useFinishedServices } from './useFinishedServices'

const anHourAgo = new Date(Date.now() - 3600e3).toISOString()

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data:
              table === 'service_sessions'
                ? [
                    // Both still running by the plan…
                    { id: 'x1', service_id: 'ended-early', start_time: anHourAgo, duration_minutes: 180 },
                    { id: 'x2', service_id: 'running', start_time: anHourAgo, duration_minutes: 180 },
                  ]
                : [
                    // …but somebody pressed End service on one of them.
                    { id: 'ended-early', ended_at: new Date(Date.now() - 60e3).toISOString() },
                    { id: 'running', ended_at: null },
                    // Ended by hand with no running order at all.
                    { id: 'no-sessions', ended_at: anHourAgo },
                  ],
            error: null,
          }),
      }),
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('which services are over', () => {
  it('counts End service, not only the planned end', async () => {
    const { result } = renderHook(
      () => useFinishedServices(['ended-early', 'running', 'no-sessions']),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isFinished('ended-early')).toBe(true))
    expect(result.current.isFinished('running')).toBe(false)
    expect(result.current.isFinished('no-sessions')).toBe(true)
  })
})

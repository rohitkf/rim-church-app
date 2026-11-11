import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useStanding } from './useStanding'

/*
 * Asking where somebody stands with the app (0278). The rule that matters:
 * not being able to ask never keeps anybody out.
 */

const answer = vi.hoisted(() => vi.fn<() => Promise<{ data: unknown; error: unknown }>>())
vi.mock('./supabaseClient', () => ({ supabase: { rpc: () => answer() } }))

const closed = { title: 'App maintenance', body: '', from: '2026-11-15T09:00:00Z', until: '2026-11-16T09:00:00Z' }

function run(userId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useStanding(userId), { wrapper })
}

// A block, not an expression: a hook that returns a function is handing vitest a clean-up to call.
beforeEach(() => {
  answer.mockReset()
})

describe('where somebody stands', () => {
  it('is not asked, and nothing is waited for, with nobody signed in', () => {
    const { result } = run(null)
    expect(result.current).toMatchObject({ standing: null, deciding: false })
    expect(answer).not.toHaveBeenCalled()
  })

  it('waits for the first answer, then says the app is open', async () => {
    answer.mockResolvedValue({ data: { closed: null, may_enter: true }, error: null })
    const { result } = run('u1')
    expect(result.current.deciding).toBe(true)
    await waitFor(() => expect(result.current.deciding).toBe(false))
    expect(result.current.standing).toEqual({ closed: null, may_enter: true, blocked: null })
  })

  it('says so when the app is closed to this person', async () => {
    answer.mockResolvedValue({ data: { closed, may_enter: false }, error: null })
    const { result } = run('u1')
    await waitFor(() => expect(result.current.standing?.closed?.title).toBe('App maintenance'))
    expect(result.current.standing?.may_enter).toBe(false)
  })

  it('says so when this person\'s account is blocked', async () => {
    answer.mockResolvedValue({ data: { closed: null, may_enter: true, blocked: { at: '2026-11-11T15:42:00Z' } }, error: null })
    const { result } = run('u1')
    await waitFor(() => expect(result.current.standing?.blocked?.at).toBe('2026-11-11T15:42:00Z'))
    expect(result.current.deciding).toBe(false)
  })

  it('keeps nobody waiting when the question fails: no answer is not "closed"', async () => {
    answer.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.my_standing' } })
    const { result } = run('u1')
    await waitFor(() => expect(result.current.deciding).toBe(false))
    expect(result.current.standing).toBeNull()
  })

  it('stops waiting after a moment on a connection that never answers', async () => {
    // Real time, a second and a half of it: the wait this guards against is a real one.
    answer.mockReturnValue(new Promise(() => {}))
    const { result } = run('u1')
    expect(result.current.deciding).toBe(true)
    await waitFor(() => expect(result.current.deciding).toBe(false), { timeout: 4_000 })
    expect(result.current.standing).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ViewAs } from '../auth/AuthContext'
import { useOwnMemberships } from './useOwnMemberships'

const auth = vi.hoisted(() => ({ viewAs: null as ViewAs | null }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, viewAs: auth.viewAs }),
}))
const fetched = vi.hoisted(() => vi.fn())
vi.mock('./queries', () => ({ fetchOwnMemberships: fetched }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  auth.viewAs = null
  fetched.mockReset()
  fetched.mockResolvedValue([{ department_id: 'media', member_type: 'core' }])
})

describe('the teams a person is on', () => {
  it('are their own roster rows', async () => {
    const { result } = renderHook(() => useOwnMemberships(), { wrapper })
    await waitFor(() => expect(result.current.teamIds).toEqual(['media']))
  })

  // The previewer's own teams leaking into a Church Member preview is what
  // put "3 still to answer" on its Dashboard.
  it('are none in a Church Member preview, whatever the previewer is on', () => {
    auth.viewAs = { as: 'church' }
    const { result } = renderHook(() => useOwnMemberships(), { wrapper })
    expect(result.current.teamIds).toEqual([])
    expect(result.current.isSuccess).toBe(true)
    expect(fetched).not.toHaveBeenCalled()
  })

  it('are exactly the previewed team in a team preview', () => {
    auth.viewAs = { as: 'member', departmentId: 'worship', departmentName: 'Worship' }
    const { result } = renderHook(() => useOwnMemberships(), { wrapper })
    expect(result.current.memberships).toEqual([{ department_id: 'worship', member_type: 'core' }])
    expect(fetched).not.toHaveBeenCalled()
  })
})

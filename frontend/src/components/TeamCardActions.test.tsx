import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { TeamCardActions } from './TeamCardActions'
import type { Department } from '../lib/types'

const DEPT: Department = {
  id: 'd1',
  name: 'Worship',
  color: '#5E5CE6',
  handbook_url: null,
  is_service_flow: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// What the update returns. Tests set this to an empty array to stand in for
// RLS quietly filtering the row out.
let updateResult: { data: unknown; error: unknown } = { data: [DEPT], error: null }
const listFetches = vi.fn()

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => ({ select: () => Promise.resolve(updateResult) }) }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))

/** The Teams list, reading the same cache the card writes to. */
function Harness() {
  const { data } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      listFetches()
      // Deliberately stale: a refetch served before the write is visible.
      // The screen must not be waiting on it, and must not be overwritten
      // by it either.
      return [DEPT]
    },
  })
  const dept = data?.[0] ?? DEPT
  return (
    <div>
      <span data-testid="colour">{dept.color}</span>
      <TeamCardActions dept={dept} />
    </div>
  )
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  updateResult = { data: [{ ...DEPT, color: '#FF9F0A' }], error: null }
  listFetches.mockClear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('setting a team colour', () => {
  it('repaints from the row the write returned, without waiting for a refetch', async () => {
    const user = renderCard()

    await user.click(await screen.findByRole('button', { name: 'Colour for Worship' }))
    await user.click(screen.getByRole('radio', { name: 'Orange' }))
    await user.click(screen.getByRole('button', { name: 'Set colour' }))

    expect(await screen.findByTestId('colour')).toHaveTextContent('#FF9F0A')
    // The sheet closes once the colour is on screen, not before.
    expect(screen.queryByRole('button', { name: 'Set colour' })).not.toBeInTheDocument()
  })

  it('says so when the write changed nothing, instead of reporting success', async () => {
    updateResult = { data: [], error: null }
    const user = renderCard()

    await user.click(await screen.findByRole('button', { name: 'Colour for Worship' }))
    await user.click(screen.getByRole('radio', { name: 'Orange' }))
    await user.click(screen.getByRole('button', { name: 'Set colour' }))

    expect((await screen.findAllByText(/did not save/i)).length).toBeGreaterThan(0)
    expect(screen.getByTestId('colour')).toHaveTextContent('#5E5CE6')
  })
})

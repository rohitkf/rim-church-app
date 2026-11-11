import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SettingsRoomCard } from './SettingsRoomCard'
import { DEFAULT_SETTINGS } from '../lib/appSettings'
import { FEEDBACK_ROOM, GENERAL_ROOM } from '../lib/settingsCatalog'

const db = vi.hoisted(() => ({ row: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[] }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { ...db.row }, error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          db.writes.push(patch)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }),
}))

beforeEach(() => {
  db.row = { ...DEFAULT_SETTINGS, feedback_retention_days: 30 }
  db.writes = []
})

function show(room: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsRoomCard room={room} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('a Settings room of the catalog’s own rows', () => {
  it('General holds the church’s time zone and the bell, and nothing else', async () => {
    show(GENERAL_ROOM)
    expect(await screen.findByText('The church’s time zone')).toBeInTheDocument()
    expect(screen.getByText('Each person’s bell keeps')).toBeInTheDocument()
    expect(screen.getByText('Bell notifications are also cleared after')).toBeInTheDocument()
    expect(screen.queryByText('Settled feedback is kept for')).toBeNull()
    // Nothing to save until something moves.
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('Feedback saves the one column it holds, and no other', async () => {
    const user = show(FEEDBACK_ROOM)
    await user.click(await screen.findByText('Settled feedback is kept for'))
    await user.click(await screen.findByRole('button', { name: /default/i }))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(Object.keys(db.writes[0])).toEqual(['feedback_retention_days'])
    expect(db.writes[0].feedback_retention_days).toBe(DEFAULT_SETTINGS.feedback_retention_days)
  })
})

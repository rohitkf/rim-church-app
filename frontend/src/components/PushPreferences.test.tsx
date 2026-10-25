import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PushPreferences } from './PushPreferences'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false }) }))

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  upserts: [] as { row: Record<string, unknown>; options: unknown }[],
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: db.row, error: null }) }) }),
      upsert: (row: Record<string, unknown>, options: unknown) => {
        db.upserts.push({ row, options })
        db.row = { board: row.board, team_chat: row.team_chat }
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

beforeEach(() => {
  db.row = null
  db.upserts = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PushPreferences />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('what reaches your phone', () => {
  it('sends board posts and team chat to the phone until somebody turns them off', async () => {
    const user = show()
    const board = await screen.findByRole('switch', { name: 'Message board posts' })
    expect(board).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Team chat' })).toBeChecked()

    await user.click(screen.getByRole('switch', { name: 'Team chat' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(db.upserts[0].row).toMatchObject({ user_id: 'me', board: true, team_chat: false })
    expect(db.upserts[0].options).toEqual({ onConflict: 'user_id' })
    expect(screen.getByRole('switch', { name: 'Team chat' })).not.toBeChecked()
  })

  it('shows what they chose before', async () => {
    db.row = { board: false, team_chat: true }
    show()
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Message board posts' })).not.toBeChecked())
    expect(screen.getByRole('switch', { name: 'Team chat' })).toBeChecked()
  })
})

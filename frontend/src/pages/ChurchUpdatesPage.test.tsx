import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChurchUpdatesPage } from './ChurchUpdatesPage'

const auth = { isAdmin: false }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  updates: [] as { patch: Record<string, unknown>; id: unknown }[],
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args })
      return Promise.resolve({ data: 'new-id', error: null })
    },
    from: () => {
      const builder: Record<string, unknown> = {}
      let patch: Record<string, unknown> | null = null
      builder.select = () => builder
      builder.order = () => builder
      builder.update = (p: Record<string, unknown>) => {
        patch = p
        return builder
      }
      builder.delete = () => builder
      builder.eq = (_col: string, id: unknown) => {
        if (patch) state.updates.push({ patch, id })
        return Promise.resolve({ error: null })
      }
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: state.rows, error: null })
      return builder
    },
  },
}))

const now = new Date().toISOString()
const row = (over: Record<string, unknown>) => ({
  id: 'u1',
  title: 'Harvest thank-you',
  body: 'Thank you to everyone.\nWe raised plenty.',
  pinned: false,
  created_at: now,
  updated_at: now,
  author: { first_name: 'Grace', last_name: 'Mensah' },
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChurchUpdatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  auth.isAdmin = false
  state.rows = []
  state.rpc = []
  state.updates = []
})

describe('church updates', () => {
  it('shows every member the updates, pinned marked, with no way to post', async () => {
    state.rows = [row({ id: 'p', title: 'Building hours', pinned: true }), row({})]
    show()
    expect(await screen.findByRole('heading', { name: 'Building hours' })).toBeInTheDocument()
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Harvest thank-you' })).toBeInTheDocument()
    expect(screen.getAllByText(/Grace Mensah/)).toHaveLength(2)
    expect(screen.queryByRole('form', { name: 'Post a church update' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin to top' })).not.toBeInTheDocument()
  })

  it('lets an Admin post one, which goes through the function that tells everybody', async () => {
    auth.isAdmin = true
    const user = show()
    const post = await screen.findByRole('button', { name: 'Post update' })
    expect(post).toBeDisabled()
    await user.type(screen.getByLabelText('Title'), 'The hall now opens at 9')
    await user.type(screen.getByLabelText('What it says'), 'Side door, from Sunday.')
    await user.click(screen.getByLabelText('Pin to the top'))
    await user.click(post)
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({
      name: 'post_church_update',
      args: { title: 'The hall now opens at 9', body: 'Side door, from Sunday.', pinned: true },
    })
    expect(await screen.findByText(/everybody has been told/)).toBeInTheDocument()
  })

  it('lets an Admin pin an update', async () => {
    auth.isAdmin = true
    state.rows = [row({})]
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Pin to top' }))
    await waitFor(() => expect(state.updates).toHaveLength(1))
    expect(state.updates[0].patch.pinned).toBe(true)
    expect(state.updates[0].id).toBe('u1')
  })
})

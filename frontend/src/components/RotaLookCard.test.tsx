import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RotaLookCard } from './RotaLookCard'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }),
}))

type Row = { id: string; name: string; color: string; sort_order: number; shown: boolean }
let tags: Row[] = []
let coordinatorColor: string | null = null
const writes: { table: string; op: string; row?: unknown; id?: string }[] = []

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        order: () => query,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tags, error: null }).then(ok),
        maybeSingle: () =>
          Promise.resolve({ data: { ...DEFAULT_SETTINGS, coordinator_color: coordinatorColor }, error: null }),
      }
      return {
        select: () => query,
        insert: (row: unknown) => {
          writes.push({ table, op: 'insert', row })
          return Promise.resolve({ error: null })
        },
        update: (row: unknown) => ({
          eq: (_c: string, id: string) => {
            writes.push({ table, op: 'update', row, id: String(id) })
            return Promise.resolve({ error: null })
          },
        }),
        delete: () => ({
          eq: (_c: string, id: string) => {
            writes.push({ table, op: 'delete', id })
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  },
}))

beforeEach(() => {
  writes.length = 0
  coordinatorColor = null
  tags = [
    { id: 't1', name: 'Shadow', color: '#34D399', sort_order: 0, shown: true },
    { id: 't2', name: 'First time', color: '#FF9F0A', sort_order: 0, shown: true },
  ]
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RotaLookCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('rota tags in App settings', () => {
  it('lists the church’s tags as they look on the rota', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Rota tags' })
    expect(within(list).getByText('Shadow')).toBeInTheDocument()
    expect(within(list).getByText('First time')).toBeInTheDocument()
  })

  it('previews a new tag in the colour picked, before anything is saved', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Add a tag/ }))
    await user.type(screen.getByPlaceholderText('Shadow'), 'Leading')
    await user.click(within(screen.getByRole('radiogroup', { name: 'Colour' })).getByRole('radio', { name: 'Pink' }))

    const badge = screen.getAllByText('Leading').at(-1)!
    expect(badge.getAttribute('style')).toContain('#FF375F')
    expect(writes).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await waitFor(() =>
      expect(writes).toContainEqual({
        table: 'rota_tags',
        op: 'insert',
        row: { name: 'Leading', color: '#FF375F', sort_order: 2, shown: true },
      }),
    )
  })

  it('refuses a second tag with the same name, whatever its case', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Add a tag/ }))
    await user.type(screen.getByPlaceholderText('Shadow'), 'shadow')
    expect(screen.getByText('There is already a tag called that.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled()
  })

  it('edits a tag’s name and colour', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Edit Shadow' }))
    const name = screen.getByDisplayValue('Shadow')
    await user.clear(name)
    await user.type(name, 'Trainee')
    await user.click(within(screen.getByRole('radiogroup', { name: 'Colour' })).getByRole('radio', { name: 'Sky' }))
    await user.click(screen.getByRole('button', { name: 'Save tag' }))
    await waitFor(() =>
      expect(writes).toContainEqual({
        table: 'rota_tags',
        op: 'update',
        id: 't1',
        row: { name: 'Trainee', color: '#64D2FF', sort_order: 0, shown: true },
      }),
    )
  })

  it('asks before deleting, and says what deleting does', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Delete First time' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(/comes off every role that carries it/)
    expect(writes).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(writes).toContainEqual({ table: 'rota_tags', op: 'delete', id: 't2' }))
  })

  it('hides a tag without deleting it', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Hide Shadow' }))
    await waitFor(() =>
      expect(writes).toContainEqual(
        expect.objectContaining({ table: 'rota_tags', op: 'update', id: 't1', row: expect.objectContaining({ shown: false }) }),
      ),
    )
  })

  /*
   * Both tags start at sort order 0 — every tag added one after another
   * does — so swapping their numbers would move nothing. Moving renumbers.
   */
  it('moves a tag down by renumbering the list', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Move Shadow down' }))
    await waitFor(() =>
      expect(writes.filter((w) => w.op === 'update')).toEqual([
        { table: 'rota_tags', op: 'update', id: 't2', row: { sort_order: 0 } },
        { table: 'rota_tags', op: 'update', id: 't1', row: { sort_order: 1 } },
      ]),
    )
  })
})

describe('the Team Coordinator’s colour', () => {
  it('previews the row in the chosen colour and saves only when asked', async () => {
    const user = show()
    const preview = await screen.findByTestId('coordinator-preview')
    // The night sky: no colour set on the row.
    expect(preview.getAttribute('style')).toBeNull()

    await user.click(within(screen.getByRole('radiogroup', { name: 'Sky colour' })).getByRole('radio', { name: 'Green' }))
    expect(screen.getByTestId('coordinator-preview').getAttribute('style')).toContain('#30D158')
    expect(writes).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Save colour' }))
    await waitFor(() =>
      expect(writes).toContainEqual({
        table: 'app_settings',
        op: 'update',
        id: 'true',
        row: { coordinator_color: '#30D158' },
      }),
    )
  })

  it('goes back to the night sky', async () => {
    coordinatorColor = '#30D158'
    const user = show()
    await screen.findByTestId('coordinator-preview')
    await waitFor(() =>
      expect(screen.getByTestId('coordinator-preview').getAttribute('style')).toContain('#30D158'),
    )
    await user.click(screen.getByRole('radio', { name: 'Night sky' }))
    await user.click(screen.getByRole('button', { name: 'Save colour' }))
    await waitFor(() =>
      expect(writes).toContainEqual({ table: 'app_settings', op: 'update', id: 'true', row: { coordinator_color: null } }),
    )
  })
})

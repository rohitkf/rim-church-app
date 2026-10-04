import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavLayoutCard } from './NavLayoutCard'
import type { NavLayout } from '../lib/navLayout'

const auth = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const db = vi.hoisted(() => ({ saved: null as unknown, writes: [] as unknown[] }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { nav_layout: db.saved }, error: null }) }),
      }),
      update: (row: { nav_layout: unknown }) => ({
        eq: () => {
          db.writes.push(row.nav_layout)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  auth.isAdmin = true
  db.saved = null
  db.writes = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NavLayoutCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const lastWrite = () => db.writes[db.writes.length - 1] as NavLayout

describe('arranging the menu', () => {
  it('starts from the app’s own groups, with Dashboard at the top', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Menu arrangement' })
    const groups = within(list).getAllByRole('textbox', { name: 'Group name' }).map((i) => (i as HTMLInputElement).value)
    expect(groups).toEqual(['Sunday', 'After the service', 'Talk', 'Church life', 'People & things'])
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Dashboard')
  })

  it('renames a group and saves the arrangement', async () => {
    const user = show()
    const [sunday] = await screen.findAllByRole('textbox', { name: 'Group name' })
    await user.clear(sunday)
    await user.type(sunday, 'Services')
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().top).toEqual(['/'])
    expect(lastWrite().groups[0].name).toBe('Services')
    expect(lastWrite().groups[0].items).toContain('/rota')
  })

  it('moves a whole group, pages and all', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    await user.click(screen.getByRole('button', { name: 'Move Talk up' }))
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().groups.map((g) => g.name)).toEqual([
      'Sunday',
      'Talk',
      'After the service',
      'Church life',
      'People & things',
    ])
    expect(lastWrite().groups[1].items).toEqual(['/messages', '/team-chat', '/updates', '/polls', '/feedback'])
  })

  it('moves a page into another group past its heading', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    // Set Lists is last in Sunday; one place down is past the next heading.
    screen.getByRole('button', { name: /Reorder Set Lists/ }).focus()
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().groups[0].items).not.toContain('/set-lists')
    expect(lastWrite().groups[1].items[0]).toBe('/set-lists')
  })

  it('adds a group and removes it again only while it is empty', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    expect(screen.getByRole('button', { name: 'Remove group Sunday' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Add group/ }))
    const remove = screen.getByRole('button', { name: 'Remove group New group' })
    expect(remove).toBeEnabled()
    await user.click(remove)
    expect(screen.queryByRole('button', { name: 'Remove group New group' })).toBeNull()
  })

  it('puts the app’s own menu back', async () => {
    db.saved = { top: ['/'], groups: [{ name: 'Everything', items: ['/rota'] }] }
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Use the app’s own menu' }))
    await waitFor(() => expect(db.writes).toEqual([null]))
  })

  it('is not there for anybody but an Admin', () => {
    auth.isAdmin = false
    show()
    expect(screen.queryByRole('list', { name: 'Menu arrangement' })).toBeNull()
  })
})

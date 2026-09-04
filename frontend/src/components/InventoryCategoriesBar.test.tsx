import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { InventoryCategoriesBar } from './InventoryCategoriesBar'
import type { InventoryCategory } from '../lib/types'

/*
 * The delete is one tap from a chip on a phone and cannot be undone, so
 * what is guarded here is that nothing reaches the database until a second
 * press says so.
 */
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

const del = vi.fn()
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        eq: (_column: string, id: string) => {
          del(id)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const categories: InventoryCategory[] = [
  { id: 'c1', department_id: 'd1', name: 'Cameras', sort_order: 0 },
]

function renderBar(counts = new Map([['c1', 3]])) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InventoryCategoriesBar
        departmentId="d1"
        categories={categories}
        counts={counts}
        onError={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('deleting a category', () => {
  it('asks before it deletes, and says what happens to the items on it', async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole('button', { name: /Cameras/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(del).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/become uncategorised/i)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/3 items/i)

    await user.click(screen.getByRole('button', { name: /Yes, delete it/ }))
    expect(del).toHaveBeenCalledWith('c1')
  })

  it('keeps the category when the answer is no', async () => {
    del.mockClear()
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole('button', { name: /Cameras/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /Keep it/ }))

    expect(del).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('says plainly when nothing is filed on it', async () => {
    del.mockClear()
    const user = userEvent.setup()
    renderBar(new Map())

    await user.click(screen.getByRole('button', { name: /Cameras/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Nothing is filed on it/i)
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServiceGuestsPanel, type ServiceGuest } from './ServiceGuestsPanel'

const guests: ServiceGuest[] = [
  { id: 'g1', service_id: 's1', name: 'Pastor Sam Vargese', note: 'Guest speaker' },
  { id: 'g2', service_id: 's1', name: 'Anita Thomas', note: null },
]

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

const update = vi.fn()
const deleteRow = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: guests, error: null }) }),
      }),
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => {
          update(patch, id)
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          deleteRow(id)
          return Promise.resolve({ error: null })
        },
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}))

function renderPanel(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ServiceGuestsPanel serviceId="s1" canManage={canManage} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('ServiceGuestsPanel', () => {
  beforeEach(() => {
    update.mockClear()
    deleteRow.mockClear()
  })

  it('corrects a guest in place, without removing and re-adding them', async () => {
    const user = renderPanel()
    await screen.findByText('Pastor Sam Vargese')

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const nameField = screen.getByLabelText('Name for Pastor Sam Vargese')
    await user.clear(nameField)
    await user.type(nameField, 'Pastor Sam Varghese')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        { name: 'Pastor Sam Varghese', note: 'Guest speaker' },
        'g1',
      ),
    )
    // The row was updated, not deleted — deleting would null the guest out
    // of every session they were leading.
    expect(deleteRow).not.toHaveBeenCalled()
  })

  it('clears a note that has been emptied', async () => {
    const user = renderPanel()
    await screen.findByText('Pastor Sam Vargese')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.clear(screen.getByLabelText('What Pastor Sam Vargese is here for'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ name: 'Pastor Sam Vargese', note: null }, 'g1'),
    )
  })

  it('leaves the guest alone on cancel', async () => {
    const user = renderPanel()
    await screen.findByText('Anita Thomas')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    await user.type(screen.getByLabelText('Name for Anita Thomas'), ' typo')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText('Anita Thomas')).toBeInTheDocument()
  })

  it('shows nobody the edit controls when the service is closed to changes', async () => {
    renderPanel(false)
    await screen.findByText('Pastor Sam Vargese')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })
})

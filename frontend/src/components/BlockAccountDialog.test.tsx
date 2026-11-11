import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockAccountDialog } from './BlockAccountDialog'

/*
 * "Block this account?" (0279): it says what blocking is before the
 * button, takes a note for the people who may block, and does the one
 * thing through block_account.
 */

const rpc = vi.hoisted(() => vi.fn<(name: string, args: unknown) => Promise<{ error: unknown }>>())
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (name: string, args: unknown) => rpc(name, args) } }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: false }) }))

const person = { id: 'u-joel', first_name: 'Joel', last_name: 'Mensah' }

function open(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <BlockAccountDialog person={person} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate }
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('the block dialog', () => {
  it('names the person and says what blocking does and does not do', () => {
    open()
    expect(screen.getByRole('heading', { name: 'Block Joel Mensah?' })).toBeInTheDocument()
    expect(screen.getByText(/still be able to sign in/)).toHaveTextContent(/blocked by an\s+administrator/)
    expect(screen.getByText(/Nothing of theirs is removed/)).toHaveTextContent(/unblock them at any time/)
  })

  it('says who the note is for', () => {
    open()
    expect(screen.getByRole('textbox', { name: /Reason/ })).toHaveAccessibleDescription(
      'Only people who can block accounts see this. Joel never will.',
    )
  })

  it('blocks with the note, tells the list to read again, and closes', async () => {
    const { onClose, invalidate } = open()
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'Asked to step back')
    await userEvent.click(screen.getByRole('button', { name: 'Block account' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(rpc).toHaveBeenCalledWith('block_account', { target_user_id: 'u-joel', why: 'Asked to step back' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account-blocks'] })
  })

  it('blocks with no note at all', async () => {
    const { onClose } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Block account' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(rpc).toHaveBeenCalledWith('block_account', { target_user_id: 'u-joel', why: null })
  })

  it('stays open and gives the database\'s own reason when it refuses', async () => {
    // block_account's refusals are sentences written for people (P0001), so they are shown as they are.
    rpc.mockResolvedValue({ error: { code: 'P0001', message: 'Only the owner can block another Admin\'s account' } })
    const { onClose } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Block account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the owner can block another Admin\'s account')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says it could not, in plain words, when the request never arrived', async () => {
    rpc.mockResolvedValue({ error: { message: 'TypeError: Failed to fetch' } })
    const { onClose } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Block account' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent('TypeError')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('backs out without blocking', async () => {
    const { onClose } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })
})

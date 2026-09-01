import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InviteDialog } from './InviteDialog'

const invoke = vi.fn()

// The dialog reads the viewer's standing only to decide how bluntly to word
// an error; an Admin is the case where the function's own message shows.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) } },
}))

function show(props: Partial<Parameters<typeof InviteDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <InviteDialog open onClose={onClose} {...props} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onClose }
}

const sentBody = () => invoke.mock.calls[0][1].body

describe('InviteDialog', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('sends the address', async () => {
    const { user } = show()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'grace@rehoboth.org')
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(invoke).toHaveBeenCalledWith('invite', expect.anything())
    expect(sentBody().email).toBe('grace@rehoboth.org')
  })

  it('carries the name, so nobody arrives as a blank row on the rota', async () => {
    const { user } = show()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'grace@rehoboth.org')
    await user.type(screen.getByPlaceholderText('Grace'), 'Grace')
    await user.type(screen.getByPlaceholderText('Mensah'), 'Mensah')
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(sentBody()).toMatchObject({ first_name: 'Grace', last_name: 'Mensah' })
  })

  it('still sends without one, because a name nobody is sure of is worse than none', async () => {
    const { user } = show()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'grace@rehoboth.org')
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(sentBody()).toMatchObject({ first_name: '', last_name: '' })
  })

  it('reports the refusal the function gives, not a shrug', async () => {
    invoke.mockResolvedValue({ data: { error: 'That address already has an account.' }, error: null })
    const { user } = show()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'grace@rehoboth.org')
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(await screen.findByText('That address already has an account.')).toBeInTheDocument()
  })

  it('will not send something that is not an address', async () => {
    // The field is type=email, so the browser refuses the submit before any
    // of our code runs — which is why nothing is asserted about the wording
    // here. The check inside handleSubmit is the belt to that pair of braces.
    const { user } = show()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'grace')
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('sends nothing at all when the address is empty', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('clears the form once it has gone, so the next invite starts empty', async () => {
    const { user } = show()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'grace@rehoboth.org')
    await user.type(screen.getByPlaceholderText('Grace'), 'Grace')
    await user.click(screen.getByRole('button', { name: /Send invite/ }))
    expect(await screen.findByText(/Invitation sent to grace@rehoboth.org/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('name@example.com')).toHaveValue('')
    expect(screen.getByPlaceholderText('Grace')).toHaveValue('')
  })
})

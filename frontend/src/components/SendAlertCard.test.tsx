import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SendAlertCard } from './SendAlertCard'

const auth = { isAdmin: true }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const state = vi.hoisted(() => ({
  rpc: [] as { name: string; args: Record<string, unknown> }[],
}))

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', color: '#ff0000', is_worship: false },
      { id: 'd2', name: 'Worship', color: '#00ff00', is_worship: true },
    ]),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args })
      return Promise.resolve({ data: 3, error: null })
    },
    from: (table: string) => {
      // The announcements table answers with whatever has been sent in
      // this test, so "recently sent" is the real round trip rather than a
      // fixture that would still pass if nothing were ever written.
      const rows =
        table === 'profiles'
          ? [
              { id: 'u1', first_name: 'Grace', last_name: 'Mensah' },
              { id: 'u2', first_name: 'Joel', last_name: 'Skaria' },
            ]
          : state.rpc.map((call, i) => ({
              id: `a${i}`,
              body: String(call.args.message),
              audience: String(call.args.audience),
              recipient_count: 3,
              created_at: new Date().toISOString(),
            }))
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.limit = () => Promise.resolve({ data: rows, error: null })
      builder.order = () => {
        const ordered: Record<string, unknown> = {
          limit: () => Promise.resolve({ data: rows, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        }
        return ordered
      }
      return builder
    },
  },
}))

function show() {
  state.rpc = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SendAlertCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** Everything this card does ends in one confirmed press. */
async function sendIt(user: ReturnType<typeof show>) {
  await user.click(screen.getByRole('button', { name: 'Send this alert' }))
  await user.click(screen.getByRole('button', { name: 'Yes, send it' }))
  await waitFor(() => expect(state.rpc).toHaveLength(1))
  return state.rpc[0]
}

beforeEach(() => {
  auth.isAdmin = true
})

describe('SendAlertCard', () => {
  it('is not there at all for somebody who cannot send one', () => {
    auth.isAdmin = false
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <SendAlertCard />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('will not send until there is something to say', async () => {
    show()
    expect(screen.getByRole('button', { name: 'Send this alert' })).toBeDisabled()
  })

  it('asks before it interrupts anybody', async () => {
    // An alert cannot be taken back, so the button that sends one is never
    // the first button pressed.
    const user = show()
    await user.type(screen.getByLabelText(/what it says/i), 'The hall is locked until 9')
    await user.click(screen.getByRole('button', { name: 'Send this alert' }))
    expect(screen.getByText(/everybody in the church/)).toBeInTheDocument()
    expect(state.rpc).toHaveLength(0)
  })

  it('sends to everybody', async () => {
    const user = show()
    await user.type(screen.getByLabelText(/what it says/i), 'Sunday is cancelled')
    const call = await sendIt(user)
    expect(call.name).toBe('send_announcement')
    expect(call.args).toMatchObject({
      message: 'Sunday is cancelled',
      audience: 'everyone',
      dept_ids: [],
      people: [],
    })
  })

  it('sends to the teams that were ticked, and names them before it does', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Teams' }))
    await user.click(await screen.findByRole('checkbox', { name: /Media/ }))
    await user.type(screen.getByLabelText(/what it says/i), 'Cameras at 8')
    await user.click(screen.getByRole('button', { name: 'Send this alert' }))
    expect(screen.getByText(/This interrupts/)).toHaveTextContent('Media')
    await user.click(screen.getByRole('button', { name: 'Yes, send it' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0].args).toMatchObject({ audience: 'teams', dept_ids: ['d1'], people: [] })
  })

  it('will not send to teams when no team has been picked', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Teams' }))
    await user.type(screen.getByLabelText(/what it says/i), 'Cameras at 8')
    expect(screen.getByRole('button', { name: 'Send this alert' })).toBeDisabled()
  })

  it('sends to the people that were picked', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'People' }))
    await user.click(await screen.findByRole('checkbox', { name: /Grace Mensah/ }))
    await user.type(screen.getByLabelText(/what it says/i), 'Please come early')
    const call = await sendIt(user)
    expect(call.args).toMatchObject({ audience: 'people', people: ['u1'], dept_ids: [] })
  })

  it('narrows the list of names as you type, so a big church is still usable', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'People' }))
    await screen.findByRole('checkbox', { name: /Grace Mensah/ })
    await user.type(screen.getByLabelText(/find somebody/i), 'joel')
    expect(screen.queryByRole('checkbox', { name: /Grace Mensah/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Joel Skaria/ })).toBeInTheDocument()
  })

  it('keeps somebody chosen even once the search stops matching them', async () => {
    // Picking two people whose names share no letters is the ordinary
    // case, and a list that dropped the first when you searched for the
    // second would make it impossible.
    const user = show()
    await user.click(screen.getByRole('button', { name: 'People' }))
    await user.click(await screen.findByRole('checkbox', { name: /Grace Mensah/ }))
    await user.type(screen.getByLabelText(/find somebody/i), 'joel')
    await user.click(screen.getByRole('checkbox', { name: /Joel Skaria/ }))
    await user.type(screen.getByLabelText(/what it says/i), 'Please come early')
    const call = await sendIt(user)
    expect(call.args.people).toEqual(['u1', 'u2'])
  })

  it('says how many it reached', async () => {
    const user = show()
    await user.type(screen.getByLabelText(/what it says/i), 'Sunday is cancelled')
    await sendIt(user)
    expect(await screen.findByText('Sent to 3 people.')).toBeInTheDocument()
  })

  it('empties the box afterwards, so the next one is not sent twice', async () => {
    const user = show()
    await user.type(screen.getByLabelText(/what it says/i), 'Sunday is cancelled')
    await sendIt(user)
    await waitFor(() => expect(screen.getByLabelText(/what it says/i)).toHaveValue(''))
  })
})

describe('the recently sent list', () => {
  it('shows what has already gone out', async () => {
    // Chosen deliberately over a silent history: an alert cannot be taken
    // back, so seeing the last few is how somebody notices they are about
    // to send the same thing twice.
    const user = show()
    await user.type(screen.getByLabelText(/what it says/i), 'Sunday is cancelled')
    await sendIt(user)
    const heading = await screen.findByText('Recently sent')
    const list = heading.closest('div')!
    expect(within(list).getByRole('listitem')).toHaveTextContent('Sunday is cancelled')
  })
})

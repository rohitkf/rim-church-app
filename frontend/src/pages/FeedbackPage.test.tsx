import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedbackPage } from './FeedbackPage'

const state = {
  admin: false,
  me: 'me',
  rows: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
}

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: state.admin, session: { user: { id: state.me } } }),
}))
vi.mock('../components/Lifespan', () => ({ Lifespan: () => null }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: state.rows, error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpc.push({ fn, args })
      return Promise.resolve({ data: 'new-id', error: null })
    },
  },
}))

const row = (over: Record<string, unknown>) => ({
  id: 'f1',
  kind: 'bug',
  body: 'The rota jumps when I scroll',
  created_by: 'someone',
  created_at: '2026-10-03T10:00:00Z',
  status: 'new',
  reply: null,
  status_changed_at: null,
  sender: { first_name: 'Grace', last_name: 'Mensah' },
  replier: null,
  ...over,
})

beforeEach(() => {
  state.admin = false
  state.rows = []
  state.rpc = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('sending feedback', () => {
  it('offers the six kinds, and asks for one before it will send', async () => {
    const user = show()
    const kinds = screen.getByRole('radiogroup', { name: 'Kind of feedback' })
    expect(within(kinds).getAllByRole('radio').map((r) => r.querySelector('.font-medium')?.textContent)).toEqual([
      'Bug',
      'Idea',
      'Improvement',
      'Confusing',
      'Praise',
      'Other',
    ])
    await user.type(screen.getByRole('textbox', { name: 'Your feedback' }), 'Something')
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeDisabled()
    expect(screen.getByText('Pick what kind it is first.')).toBeInTheDocument()
  })

  it('sends the kind and the words through the database’s own function, then says thank you', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: /^Idea/ }))
    // The box asks the question that suits the kind.
    expect(screen.getByRole('textbox', { name: 'Your feedback' })).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/What would you like the app to do/),
    )
    await user.type(screen.getByRole('textbox', { name: 'Your feedback' }), '  Dark mode for the rota  ')
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({ fn: 'submit_feedback', args: { p_kind: 'idea', p_body: 'Dark mode for the rota' } })
    expect(await screen.findByText(/it’s with the Admins/)).toBeInTheDocument()
  })
})

describe('your own feedback', () => {
  it('shows where it stands and the reply', async () => {
    state.rows = [
      row({ created_by: 'me', status: 'looking', reply: 'Reproduced it — fix coming.', replier: { first_name: 'Sam', last_name: 'Lee' } }),
    ]
    show()
    expect(await screen.findByText('The rota jumps when I scroll')).toBeInTheDocument()
    expect(screen.getByText('Looking into it')).toBeInTheDocument()
    expect(screen.getByText('Reply from Sam')).toBeInTheDocument()
    expect(screen.getByText('Reproduced it — fix coming.')).toBeInTheDocument()
    // Picked up already, so it cannot be taken back.
    expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull()
  })

  it('can be taken back while nobody has picked it up', async () => {
    state.rows = [row({ created_by: 'me' })]
    show()
    expect(await screen.findByRole('button', { name: 'Take back' })).toBeInTheDocument()
  })

  it('offers nobody but an Admin the way to answer', async () => {
    state.rows = [row({ created_by: 'me' })]
    show()
    await screen.findByText('The rota jumps when I scroll')
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull()
    expect(screen.queryByRole('tab', { name: /Everyone’s/ })).toBeNull()
  })
})

describe('for Admins', () => {
  beforeEach(() => {
    state.admin = true
    state.rows = [
      row({ id: 'p1', kind: 'praise', body: 'Love the countdown' }),
      row({ id: 'b1', kind: 'bug', body: 'Rota jumps' }),
      row({ id: 'i1', kind: 'idea', body: 'Dark mode', status: 'done' }),
      row({ id: 'b2', kind: 'bug', body: 'Checklist tick lags', created_at: '2026-10-03T12:00:00Z' }),
    ]
  })

  it('groups everybody’s open feedback by kind, bugs first', async () => {
    show()
    await screen.findByText('Rota jumps')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    const order = headings.filter((h) => /^(Bug|Idea|Praise)/.test(h ?? ''))
    expect(order).toEqual(['Bug2', 'Praise1'])
    // Done is settled, so it waits under its own filter.
    expect(screen.queryByText('Dark mode')).toBeNull()
    await userEvent.setup().click(screen.getByRole('radio', { name: /^All/ }))
    expect(screen.getByText('Dark mode')).toBeInTheDocument()
  })

  it('says who sent each one', async () => {
    show()
    expect((await screen.findAllByText('Grace Mensah')).length).toBeGreaterThan(0)
  })

  it('answers one: a status and a reply, through the database’s own function', async () => {
    const user = show()
    const card = (await screen.findByText('Rota jumps')).closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Answer' }))
    // Opening an answer moves a New one on to Looking into it by default.
    expect(within(card).getByRole('radio', { name: 'Looking into it' })).toBeChecked()
    await user.click(within(card).getByRole('radio', { name: 'Done' }))
    await user.type(within(card).getByRole('textbox', { name: 'Reply to the sender' }), 'Fixed in the latest version.')
    await user.click(within(card).getByRole('button', { name: 'Save and tell them' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({
      fn: 'mark_feedback',
      args: { p_id: 'b1', p_status: 'done', p_reply: 'Fixed in the latest version.' },
    })
  })

  it('can still send feedback of their own, and see just theirs', async () => {
    state.rows.push(row({ id: 'm1', created_by: 'me', kind: 'other', body: 'Mine' }))
    const user = show()
    await screen.findByText('Rota jumps')
    expect(screen.getByRole('radiogroup', { name: 'Kind of feedback' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Yours/ }))
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Rota jumps')).toBeNull()
  })
})

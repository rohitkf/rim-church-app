import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OnboardingCard } from './OnboardingCard'

const db = vi.hoisted(() => ({
  people: [
    { id: 'a', first_name: 'Ada', last_name: 'Grace' },
    { id: 'b', first_name: 'Ben', last_name: 'Okafor' },
    { id: 'c', first_name: 'Cara', last_name: 'Lim' },
  ],
  rows: [
    { user_id: 'a', seen: { welcome: '2026-10-02T10:00:00Z' }, pushed_at: null, pushed_by: null },
    { user_id: 'b', seen: {}, pushed_at: '2026-10-05T10:00:00Z', pushed_by: 'me' },
  ],
  pushes: [] as (string[] | null)[],
  allowed: true,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: () => db.allowed }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const rows = Promise.resolve({ data: table === 'profiles' ? db.people : db.rows, error: null })
        return Object.assign(rows, { order: () => rows })
      },
    }),
    rpc: (fn: string, args: { p_users: string[] | null }) => {
      if (fn !== 'push_onboarding') return Promise.resolve({ data: null, error: { message: 'no' } })
      db.pushes.push(args.p_users)
      return Promise.resolve({ data: args.p_users ? args.p_users.length : db.people.length, error: null })
    },
  },
}))

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OnboardingCard />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  db.pushes = []
  db.allowed = true
})

describe('Settings › Onboarding', () => {
  it('lists everybody with where they are: taken, sent and waiting, or not yet', async () => {
    show()
    const ada = (await screen.findByText('Ada Grace')).closest('li')!
    expect(within(ada).getByText(/Taken/)).toBeInTheDocument()
    const ben = screen.getByText('Ben Okafor').closest('li')!
    expect(within(ben).getByText(/Sent .* waiting/)).toBeInTheDocument()
    const cara = screen.getByText('Cara Lim').closest('li')!
    expect(within(cara).getByText('Not yet')).toBeInTheDocument()
  })

  it('sends the tour to the people ticked', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    expect(screen.getByRole('button', { name: 'Send to the people ticked below' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Ben Okafor' }))
    await user.click(screen.getByRole('checkbox', { name: 'Cara Lim' }))
    await user.click(screen.getByRole('button', { name: 'Send to 2 people' }))
    await waitFor(() => expect(db.pushes).toEqual([['b', 'c']]))
  })

  it('sends it to everyone only after asking', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    await user.click(screen.getByRole('button', { name: 'Send to everyone' }))
    expect(screen.getByRole('alertdialog', { name: 'Send the tour to everyone?' })).toBeInTheDocument()
    expect(db.pushes).toEqual([])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Send to everyone' }))
    await waitFor(() => expect(db.pushes).toEqual([null]))
  })

  it('finds somebody by name', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    await user.type(screen.getByRole('textbox', { name: 'Find somebody' }), 'car')
    expect(screen.queryByText('Ada Grace')).toBeNull()
    expect(screen.getByText('Cara Lim')).toBeInTheDocument()
  })

  it('is not there for somebody who may not send it', () => {
    db.allowed = false
    show()
    expect(screen.queryByText('Send the tour')).toBeNull()
  })
})

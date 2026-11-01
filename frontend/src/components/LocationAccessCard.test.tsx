import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LocationAccessCard } from './LocationAccessCard'

const db = vi.hoisted(() => ({
  people: [
    { id: 'a', first_name: 'Ada', last_name: 'Grace' },
    { id: 'b', first_name: 'Ben', last_name: 'Okafor' },
    { id: 'c', first_name: 'Cara', last_name: 'Lim' },
    { id: 'd', first_name: 'Dev', last_name: 'Shah' },
  ],
  rows: [
    { user_id: 'a', state: 'granted', platform: 'ios', installed: true, reported_at: '2026-10-30T10:00:00Z', asked_at: null },
    { user_id: 'b', state: 'denied', platform: 'android', installed: false, reported_at: '2026-10-29T10:00:00Z', asked_at: '2026-10-31T09:00:00Z' },
    { user_id: 'c', state: 'unknown', platform: 'ios', installed: false, reported_at: '2026-10-28T10:00:00Z', asked_at: null },
  ],
  asks: [] as (string[] | null)[],
}))

vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const rows = Promise.resolve({ data: table === 'profiles' ? db.people : db.rows, error: null })
        return Object.assign(rows, { order: () => rows })
      },
    }),
    rpc: (fn: string, args: { p_users: string[] | null }) => {
      if (fn !== 'prompt_location') return Promise.resolve({ data: null, error: { message: 'no' } })
      db.asks.push(args.p_users)
      return Promise.resolve({ data: args.p_users ? args.p_users.length : 3, error: null })
    },
  },
}))

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocationAccessCard />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  db.asks = []
})

describe('Settings › Onboarding › Location on their phones', () => {
  it('lists everybody: allowed, blocked, not yet, or not opened since', async () => {
    show()
    const ada = await screen.findByRole('listitem', { name: 'Ada Grace' })
    expect(within(ada).getByText('Allowed')).toBeInTheDocument()
    expect(within(ada).getByText(/iPhone app/)).toBeInTheDocument()
    const ben = screen.getByRole('listitem', { name: 'Ben Okafor' })
    expect(within(ben).getByText('Blocked')).toBeInTheDocument()
    expect(within(ben).getByText(/Android .* asked/)).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Cara Lim' })).getByText('Not allowed yet')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Dev Shah' })).getByText('Not opened since')).toBeInTheDocument()
    expect(screen.getByText(/1 allowed · 3 not/)).toBeInTheDocument()
  })

  it('shows only those not allowing it', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Ada Grace' })
    await userEvent.click(screen.getByRole('button', { name: 'Not allowed' }))
    const list = screen.getByRole('list', { name: 'Location on their phones' })
    expect(within(list).queryByText('Ada Grace')).not.toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('asks the people ticked', async () => {
    show()
    await userEvent.click(await screen.findByRole('checkbox', { name: /Ben Okafor/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Ask 1 person' }))
    expect(db.asks).toEqual([['b']])
  })

  it('asks everyone not allowed only after confirming', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Ada Grace' })
    await userEvent.click(screen.getByRole('button', { name: 'Ask everyone not allowed' }))
    expect(db.asks).toEqual([])
    await userEvent.click(await screen.findByRole('button', { name: 'Ask them' }))
    expect(db.asks).toEqual([null])
  })
})

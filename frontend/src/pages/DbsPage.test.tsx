import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DbsPage } from './DbsPage'
import { dbsAge } from '../lib/dbs'
import { todayIso } from '../lib/monthGrid'

/*
 * DBS checks (0324): everybody's on one page, filtered by where they
 * stand and searched by name, with the dialog that checks one.
 */

const state = vi.hoisted(() => ({
  people: [] as { id: string; first_name: string; last_name: string }[],
  says: [] as string[],
  rows: [] as Record<string, unknown>[],
  rpcs: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'owner' }, isSuperAdmin: true }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string) => {
      state.rpcs.push(name)
      return Promise.resolve({ data: null, error: { message: 'not in this test' } })
    },
    from: (table: string) => ({
      select: () => {
        if (table === 'profiles') return { order: () => Promise.resolve({ data: state.people, error: null }) }
        if (table === 'profile_sensitive') {
          return Promise.resolve({ data: state.people.map((p) => ({ user_id: p.id, has_dbs: state.says.includes(p.id) })), error: null })
        }
        return Promise.resolve({ data: state.rows, error: null })
      },
    }),
  },
}))

const row = (id: string, over: Record<string, unknown> = {}) => ({
  user_id: id,
  kind: 'enhanced',
  certificate_number: '001234567890',
  surname: 'X',
  issued_on: '2023-03-14',
  workforce: 'child',
  update_service: true,
  consented_at: '2026-11-20T10:00:00Z',
  verified_at: null,
  verified_by: null,
  status_checked: false,
  certificate_seen: false,
  id_seen: false,
  ...over,
})

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DbsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const listed = () => within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))

beforeEach(() => {
  state.rpcs = []
  state.people = [
    { id: 'anna', first_name: 'Anna', last_name: 'Jacob' },
    { id: 'tom', first_name: 'Tom', last_name: 'Jacob' },
    { id: 'rose', first_name: 'Rose', last_name: 'Mathew' },
    { id: 'joel', first_name: 'Joel', last_name: 'Skaria' },
    { id: 'owner', first_name: 'Rohit', last_name: 'Owner' },
  ]
  state.says = ['anna', 'tom', 'rose']
  state.rows = [row('anna', { verified_at: '2026-11-21T09:30:00Z', verified_by: 'owner', certificate_seen: true }), row('tom', { kind: 'basic', issued_on: '2024-06-01' })]
})

describe('the DBS checks page', () => {
  it('lists everybody, what wants doing first: to check, no details, verified, no DBS', async () => {
    show()
    await screen.findByRole('list', { name: 'People' })
    expect(listed()).toEqual(['Tom Jacob', 'Rose Mathew', 'Anna Jacob', 'Joel Skaria', 'Rohit Owner'])
  })

  it('says where each stands, the certificate and how old it is, and who verified it', async () => {
    show()
    const tom = await screen.findByRole('button', { name: 'DBS of Tom Jacob: DBS to check' })
    expect(tom).toHaveTextContent(`Basic · issued 1 June 2024 · ${dbsAge('2024-06-01', todayIso())}`)
    const anna = screen.getByRole('button', { name: 'DBS of Anna Jacob: DBS verified' })
    expect(anna).toHaveTextContent(`Enhanced · issued 14 March 2023 · ${dbsAge('2023-03-14', todayIso())} · verified 21 November 2026 by Rohit Owner`)
    expect(screen.getByRole('button', { name: 'DBS of Rose Mathew: DBS: no details' })).toHaveTextContent(/has not given the certificate’s details yet/)
    expect(screen.getByRole('button', { name: 'DBS of Joel Skaria: No DBS' })).toHaveTextContent('Says they have no DBS check.')
  })

  it('counts each standing, on the tiles and on the filter', async () => {
    show()
    await screen.findByRole('list', { name: 'People' })
    const text = document.body.textContent ?? ''
    expect(text).toContain('1to check')
    expect(text).toContain('1details not given')
    expect(text).toContain('1verified')
    expect(text).toContain('2no DBS')
    const filter = screen.getByRole('radiogroup', { name: 'Show' })
    expect(within(filter).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Everybody 5', 'To check 1', 'No details 1', 'Verified 1', 'No DBS 2'])
  })

  it('filters by where people stand', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'People' })
    await user.click(screen.getByRole('radio', { name: 'To check 1' }))
    expect(listed()).toEqual(['Tom Jacob'])
    await user.click(screen.getByRole('radio', { name: 'No DBS 2' }))
    expect(listed()).toEqual(['Joel Skaria', 'Rohit Owner'])
    await user.click(screen.getByRole('radio', { name: 'Everybody 5' }))
    expect(listed()).toHaveLength(5)
  })

  it('searches by name, within the filter', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'People' })
    await user.type(screen.getByRole('searchbox', { name: 'Find a person' }), 'jacob')
    expect(listed()).toEqual(['Tom Jacob', 'Anna Jacob'])
    await user.click(screen.getByRole('radio', { name: 'Verified 1' }))
    expect(listed()).toEqual(['Anna Jacob'])
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'nobody')
    expect(screen.queryByRole('list', { name: 'People' })).toBeNull()
    expect(screen.getByText('Nobody by that name here.')).toBeInTheDocument()
  })

  it('says so when nobody is waiting to be checked', async () => {
    state.rows = [row('anna', { verified_at: '2026-11-21T09:30:00Z' }), row('tom', { verified_at: '2026-11-21T09:30:00Z' })]
    const user = show()
    await screen.findByRole('list', { name: 'People' })
    await user.click(screen.getByRole('radio', { name: 'To check 0' }))
    expect(screen.getByText('Nobody is waiting to be checked.')).toBeInTheDocument()
  })

  it('opens the check for the person pressed', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'DBS of Tom Jacob: DBS to check' }))
    expect(await screen.findByRole('heading', { name: 'Tom Jacob’s DBS' })).toBeInTheDocument()
    expect(state.rpcs).toContain('dbs_of')
  })

  it('does not count a row left behind a no as a DBS', async () => {
    state.says = ['tom']
    show()
    await screen.findByRole('list', { name: 'People' })
    expect(screen.getByRole('button', { name: 'DBS of Anna Jacob: No DBS' })).toHaveTextContent('Says they have no DBS check.')
  })
})

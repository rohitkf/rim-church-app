import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { isNoSuchRow } from '../lib/pageErrors'
import { QueryState } from './QueryState'

/*
 * Loading, failed, empty, there — the same way on every page. A failure
 * offers trying again and the Dashboard; a page about one thing that is
 * not there says so, with the way to the list it belongs to.
 */

const reloadApp = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadApp', () => ({ reloadApp }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

beforeEach(() => {
  reloadApp.mockClear()
  window.history.replaceState({}, '', '/rota')
})

describe('QueryState', () => {
  it('shows what it was given when there is nothing in the way', () => {
    render(
      <QueryState isLoading={false} error={null}>
        <p>the list</p>
      </QueryState>,
    )
    expect(screen.getByText('the list')).toBeInTheDocument()
  })

  it('says it is loading', () => {
    render(
      <QueryState isLoading error={null}>
        <p>the list</p>
      </QueryState>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('the list')).toBeNull()
  })

  it('says a list is empty in the page\'s own words', () => {
    render(
      <QueryState isLoading={false} error={null} isEmpty emptyMessage="No songs yet.">
        <p>the list</p>
      </QueryState>,
    )
    expect(screen.getByText('No songs yet.')).toBeInTheDocument()
  })
})

describe('a read that failed', () => {
  it('says so in plain words and offers trying again and the Dashboard', () => {
    render(
      <QueryState isLoading={false} error={{ message: 'TypeError: Failed to fetch' }}>
        <p>the list</p>
      </QueryState>,
    )
    expect(screen.getByText('Something went wrong loading this.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('the list')).toBeNull()
  })

  it('does not offer the Dashboard to somebody who is on it', () => {
    window.history.replaceState({}, '', '/')
    render(
      <QueryState isLoading={false} error={new Error('offline')}>
        <p>the list</p>
      </QueryState>,
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })

  it('reloads the page to try again when it has no query client to ask', async () => {
    render(
      <QueryState isLoading={false} error={new Error('offline')}>
        <p>the list</p>
      </QueryState>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('asks again for everything on the page that failed, and shows it when it comes', async () => {
    const answers = { rota: vi.fn(), songs: vi.fn(), fine: vi.fn() }
    answers.rota.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('the rota')
    answers.songs.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('the songs')
    answers.fine.mockResolvedValue('the diary')

    function Panel({ name }: { name: keyof typeof answers }) {
      const query = useQuery({ queryKey: [name], queryFn: () => answers[name]() as Promise<string>, retry: false })
      return (
        <QueryState isLoading={query.isLoading} error={query.error}>
          <p>{query.data}</p>
        </QueryState>
      )
    }
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <Panel name="rota" />
        <Panel name="songs" />
        <Panel name="fine" />
      </QueryClientProvider>,
    )
    // Both failures, however long each took to come back.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2))
    const retry = screen.getAllByRole('button', { name: 'Try again' })
    expect(await screen.findByText('the diary')).toBeInTheDocument()

    await userEvent.click(retry[0])
    expect(await screen.findByText('the rota')).toBeInTheDocument()
    expect(await screen.findByText('the songs')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull())
    // What had not failed was left alone, and nothing was reloaded.
    expect(answers.fine).toHaveBeenCalledTimes(1)
    expect(reloadApp).not.toHaveBeenCalled()
  })
})

describe('a page about one thing that is not there', () => {
  const missing = { title: 'Team not found', back: { to: '/departments', label: 'All teams' } }

  it('says what is missing, and leads to its list and to the Dashboard', () => {
    render(
      <MemoryRouter>
        <QueryState isLoading={false} error={null} isEmpty missing={missing}>
          <p>the team</p>
        </QueryState>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Team not found' })).toBeInTheDocument()
    expect(screen.getByText(/may have been removed, the link may be wrong, or it may not be open to you/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All teams' })).toHaveAttribute('href', '/departments')
    expect(screen.getByRole('link', { name: 'Back to the Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('the team')).toBeNull()
  })

  it('uses the page\'s own sentence where it gives one', () => {
    render(
      <MemoryRouter>
        <QueryState isLoading={false} error={null} isEmpty missing={{ title: 'Service not found', body: 'It may have been deleted, or the link may be wrong.' }}>
          {null}
        </QueryState>
      </MemoryRouter>,
    )
    expect(screen.getByText('It may have been deleted, or the link may be wrong.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('is also what a link cut short gets: an id the database cannot read as one', () => {
    render(
      <MemoryRouter>
        <QueryState
          isLoading={false}
          error={{ code: '22P02', message: 'invalid input syntax for type uuid: "0b2f9c1e-77"' }}
          missing={missing}
        >
          {null}
        </QueryState>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Team not found' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByText(/invalid input syntax/)).toBeNull()
  })

  it('and what a lookup of one row that found none gets', () => {
    expect(isNoSuchRow({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(true)
    expect(isNoSuchRow({ code: '22P02' })).toBe(true)
    expect(isNoSuchRow({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isNoSuchRow(new Error('offline'))).toBe(false)
    expect(isNoSuchRow(null)).toBe(false)
  })

  it('leaves a bad id on a list as the failure it is: only a page about one thing can be "not found"', () => {
    render(
      <QueryState isLoading={false} error={{ code: '22P02', message: 'invalid input syntax for type uuid' }}>
        {null}
      </QueryState>,
    )
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('is a failure, not "missing", when the read failed', () => {
    render(
      <MemoryRouter>
        <QueryState isLoading={false} error={new Error('offline')} isEmpty missing={missing}>
          {null}
        </QueryState>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('heading', { name: 'Team not found' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WelcomeTour } from './WelcomeTour'

/*
 * What has to be true of a welcome: it greets the person who has just
 * arrived, it never greets anybody twice, and every way out of it counts
 * as having been welcomed — including the ones that are not the button.
 */
const update = vi.fn()
const refreshProfile = vi.fn()

const profile = {
  id: 'me',
  first_name: 'Ada',
  last_name: 'Grace',
  email: 'ada@example.com',
  welcomed_at: null as string | null,
}

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'me' } },
    profile,
    isAdmin: false,
    ledDepartmentIds: [],
    refreshProfile,
  }),
}))

const roster = vi.fn(() => [] as string[])
vi.mock('../lib/queries', () => ({
  fetchOwnDepartmentIds: () => Promise.resolve(roster()),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => {
          update({ patch, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WelcomeTour />} />
          <Route path="/departments" element={<p>Teams page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('the first time somebody opens the app', () => {
  beforeEach(() => {
    update.mockReset()
    refreshProfile.mockReset()
    roster.mockReturnValue([])
    profile.welcomed_at = null
  })

  it('greets the person by name', () => {
    show()
    expect(screen.getByText('Welcome, Ada.')).toBeInTheDocument()
  })

  it('is not shown to somebody who has been welcomed before', () => {
    profile.welcomed_at = '2026-01-01T00:00:00Z'
    show()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('walks three beats and ends on the one thing to do', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText(/Three things/)).toBeInTheDocument()
    expect(screen.getByText('Know when to be there')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('Find your team.')).toBeInTheDocument()
  })

  it('takes somebody to the teams page, and marks them welcomed on the way', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.click(screen.getByRole('button', { name: /Find your team/ }))

    expect(await screen.findByText('Teams page')).toBeInTheDocument()
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][0].id).toBe('me')
    expect(update.mock.calls[0][0].patch.welcomed_at).toEqual(expect.any(String))
  })

  it('counts skipping as having been welcomed, so it does not come back', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('counts the corner × the same way', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says something else to somebody who is already on a team', async () => {
    roster.mockReturnValue(['media'])
    const user = show()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('You are already on a team.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Find your team/ })).not.toBeInTheDocument()
  })
})

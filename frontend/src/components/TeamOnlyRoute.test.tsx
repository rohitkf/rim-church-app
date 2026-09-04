import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamOnlyRoute } from './TeamOnlyRoute'

/*
 * Hiding a link from the dock is most of the job. This is the rest: an
 * address somebody was sent, typed, or has bookmarked.
 */
const rosterRows = vi.fn()

vi.mock('../lib/queries', () => ({
  fetchOwnDepartmentIds: () => Promise.resolve(rosterRows()),
}))

const auth = { isAdmin: false, ledDepartmentIds: [] as string[] }
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, ...auth }),
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route element={<TeamOnlyRoute />}>
            <Route path="/inventory" element={<p>The register</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the teams’ own pages', () => {
  it('sends somebody on no team back to the dashboard', async () => {
    auth.isAdmin = false
    auth.ledDepartmentIds = []
    rosterRows.mockReturnValue([])
    show()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('The register')).not.toBeInTheDocument()
  })

  it('lets somebody on a team through', async () => {
    auth.isAdmin = false
    auth.ledDepartmentIds = []
    rosterRows.mockReturnValue(['media'])
    show()
    expect(await screen.findByText('The register')).toBeInTheDocument()
  })

  it('lets a head through, who has a team without a roster row', async () => {
    auth.isAdmin = false
    auth.ledDepartmentIds = ['media']
    rosterRows.mockReturnValue([])
    show()
    expect(await screen.findByText('The register')).toBeInTheDocument()
  })

  it('waits for the roster rather than redirecting on a guess', () => {
    auth.isAdmin = false
    auth.ledDepartmentIds = []
    rosterRows.mockReturnValue(new Promise(() => {}))
    show()
    // Neither page, yet: a redirect here would throw a member off their
    // own destination while the answer was still in flight.
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('The register')).not.toBeInTheDocument()
  })
})

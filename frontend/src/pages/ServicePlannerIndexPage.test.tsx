import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { ServicePlannerIndexPage } from './ServicePlannerIndexPage'

const auth = { isAdmin: true }
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}))
vi.mock('../lib/queries', () => ({
  fetchServices: () => Promise.resolve([]),
  fetchServiceTemplates: () => Promise.resolve([]),
  fetchTemplateSessions: () => Promise.resolve([]),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // A data router, because the page's unsaved-changes guard uses
  // useBlocker, which only exists on one.
  const router = createMemoryRouter(
    [{ path: '/service-planner', element: <ServicePlannerIndexPage /> }],
    { initialEntries: ['/service-planner'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('ServicePlannerIndexPage', () => {
  it('offers an Admin the one way to start a service', async () => {
    // This button used to live in the sidebar. When the sidebar became a
    // dock of destinations it went with it, and there was then no way at
    // all to create a service — so this test exists to keep it reachable.
    auth.isAdmin = true
    renderPage()
    expect(await screen.findByRole('button', { name: /new service/i })).toBeInTheDocument()
  })

  it('opens the form when it is pressed', async () => {
    auth.isAdmin = true
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: /new service/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('does not offer it to someone who cannot schedule services', async () => {
    auth.isAdmin = false
    renderPage()
    expect(screen.queryByRole('button', { name: /new service/i })).not.toBeInTheDocument()
  })
})

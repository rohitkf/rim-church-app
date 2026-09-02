import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AlertBanner } from './AlertBanner'

const state = vi.hoisted(() => ({
  rows: [
    {
      id: 'n1',
      type: 'team_alert',
      body: 'Sound check moved to 8:30',
      created_at: new Date().toISOString(),
    },
    {
      id: 'n2',
      type: 'team_alert',
      body: 'Bring the long XLR',
      created_at: new Date().toISOString(),
    },
  ] as { id: string; type: string; body: string; created_at: string }[],
  updated: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {}
      const self = () => builder
      builder.select = self
      builder.in = self
      builder.eq = (column: string, value: unknown) => {
        if (column === 'id') state.updated.push(String(value))
        return builder
      }
      builder.order = () => Promise.resolve({ data: state.rows, error: null })
      builder.update = (patch: { read_boolean: boolean }) => {
        expect(patch.read_boolean).toBe(true)
        return builder
      }
      builder.then = (resolve: (v: unknown) => void) => resolve({ error: null })
      return builder
    },
  },
}))

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AlertBanner />
    </QueryClientProvider>,
  )
}

describe('the alert that has to be acknowledged', () => {
  it('shows the oldest one first, and says how many are behind it', async () => {
    renderBanner()

    expect(await screen.findByText('Sound check moved to 8:30')).toBeInTheDocument()
    expect(screen.getByText(/1 more alert after this/)).toBeInTheDocument()
  })

  it('marks it read when acknowledged, which is what clears it from the bell too', async () => {
    renderBanner()
    await screen.findByText('Sound check moved to 8:30')

    await userEvent.click(screen.getByRole('button', { name: /okay/i }))

    await waitFor(() => expect(state.updated).toContain('n1'))
  })

  it('is not there at all when nothing is waiting', async () => {
    state.rows = []
    const { container } = renderBanner()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

describe('where the interruption came from', () => {
  it('says a team alert is from the team', async () => {
    state.rows = [
      { id: 'n1', type: 'team_alert', body: 'Sound check at 8:30', created_at: new Date().toISOString() },
    ]
    renderBanner()
    expect(await screen.findByText('From your team')).toBeInTheDocument()
  })

  it('does not put the church\u2019s own words in a team\u2019s mouth', async () => {
    // The banner used to say "from your team" over everything it showed,
    // which would have been a lie the moment an Admin could write to the
    // whole church from the settings page.
    state.rows = [
      { id: 'n2', type: 'announcement', body: 'The hall is locked until 9', created_at: new Date().toISOString() },
    ]
    renderBanner()
    expect(await screen.findByText('From the church')).toBeInTheDocument()
    expect(screen.queryByText('From your team')).not.toBeInTheDocument()
  })
})

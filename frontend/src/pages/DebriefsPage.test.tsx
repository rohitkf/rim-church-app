import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DebriefsPage } from './DebriefsPage'

/*
 * What each team said after the service. Written by whoever runs the team,
 * read by everybody, and kept for a month — the page has to be honest
 * about that last part, or the words vanish unannounced.
 */

const TODAY = '2026-09-14'

const state = vi.hoisted(() => ({
  debriefs: [] as Record<string, unknown>[],
  written: [] as { table: string; op: string; row: unknown; id?: string }[],
  leads: true,
  retention: 30,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: false,
    isDepartmentHead: () => state.leads,
  }),
}))

vi.mock('../lib/monthGrid', async () => {
  const actual = await vi.importActual<typeof import('../lib/monthGrid')>('../lib/monthGrid')
  return { ...actual, todayIso: () => TODAY }
})

vi.mock('../lib/appSettings', () => ({
  useAppSettings: () => ({ debrief_retention_days: state.retention }),
}))

vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: '2026-09-13', service_type: 'English Service' },
      // Long past its window: its minutes are gone, so it is not a heading
      // over an empty space.
      { id: 's0', date: '2026-06-01', service_type: 'Old Service' },
      // Still to come — there is nothing to debrief yet.
      { id: 's2', date: '2026-09-20', service_type: 'Next Sunday' },
    ]),
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', color: '#3b82f6' },
      { id: 'd2', name: 'Audio', color: '#ef4444' },
    ]),
}))

vi.mock('../components/TeamMark', () => ({ TeamMark: () => null }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: state.debriefs, error: null }),
      }),
      insert: (row: unknown) => {
        state.written.push({ table, op: 'insert', row })
        return Promise.resolve({ error: null })
      },
      update: (row: unknown) => ({
        eq: (_c: string, id: string) => {
          state.written.push({ table, op: 'update', row, id })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          state.written.push({ table, op: 'delete', row: null, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  state.debriefs = []
  state.written = []
  state.leads = true
  state.retention = 30
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DebriefsPage />
    </QueryClientProvider>,
  )
}

const minutes = (over: Record<string, unknown> = {}) => ({
  id: 'db1',
  service_id: 's1',
  department_id: 'd1',
  minutes: 'Radio mic died again; batteries on the list.',
  written_by: 'u9',
  created_at: '2026-09-13T20:00:00Z',
  updated_at: '2026-09-13T20:00:00Z',
  author: { id: 'u9', first_name: 'Grace', last_name: 'Mensah' },
  ...over,
})

describe('debriefs', () => {
  it('lists the services that have happened and still have minutes to keep', async () => {
    show()
    expect(await screen.findByText('English Service')).toBeInTheDocument()
    // Not the one still to come, and not the one whose window has run out.
    expect(screen.queryByText('Next Sunday')).toBeNull()
    expect(screen.queryByText('Old Service')).toBeNull()
  })

  /*
   * Words that disappear unannounced are worse than words nobody wrote:
   * the page says how long they have.
   */
  it('says how long the minutes have left', async () => {
    show()
    await screen.findByText('English Service')
    expect(screen.getByText(/Kept until/)).toBeInTheDocument()
    expect(screen.getByText(/30 days left/)).toBeInTheDocument()
  })

  it('warns on the last day rather than saying "1 day"', async () => {
    state.retention = 1
    show()
    await screen.findByText('English Service')
    expect(screen.getByText(/on their last day/i)).toBeInTheDocument()
  })

  it('shows what a team wrote, and who wrote it', async () => {
    state.debriefs = [minutes()]
    show()
    expect(await screen.findByText(/Radio mic died again/)).toBeInTheDocument()
    expect(screen.getByText(/Grace Mensah/)).toBeInTheDocument()
  })

  it('writes the minutes against the team and the service', async () => {
    show()
    await screen.findByText('English Service')

    const media = screen.getByText('Media').closest('li') as HTMLElement
    await userEvent.click(within(media).getByRole('button', { name: 'Write them up' }))
    await userEvent.type(
      screen.getByLabelText('Debrief minutes'),
      'Projector cable needs replacing.',
    )
    await userEvent.click(screen.getByRole('button', { name: /Save minutes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ table: 'service_debriefs', op: 'insert' })
    expect(state.written[0].row).toMatchObject({
      service_id: 's1',
      department_id: 'd1',
      minutes: 'Projector cable needs replacing.',
      written_by: 'u1',
    })
  })

  it('edits in place rather than writing a second set', async () => {
    state.debriefs = [minutes()]
    show()
    await screen.findByText(/Radio mic died again/)

    const media = screen.getByText('Media').closest('li') as HTMLElement
    await userEvent.click(within(media).getByRole('button', { name: 'Edit' }))
    await userEvent.type(screen.getByLabelText('Debrief minutes'), ' Ordered.')
    await userEvent.click(screen.getByRole('button', { name: /Save minutes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ op: 'update', id: 'db1' })
  })

  // Everybody reads; only whoever runs the team writes.
  it('lets somebody who runs no team read but not write', async () => {
    state.leads = false
    state.debriefs = [minutes()]
    show()

    expect(await screen.findByText(/Radio mic died again/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Write them up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('says plainly when a team has not written up', async () => {
    show()
    await screen.findByText('English Service')
    const audio = screen.getByText('Audio').closest('li') as HTMLElement
    expect(within(audio).getByText(/Nothing written up yet/)).toBeInTheDocument()
  })
})

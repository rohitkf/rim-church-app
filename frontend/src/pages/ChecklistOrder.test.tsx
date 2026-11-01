import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

const SUNDAY = '2026-09-06'
const MEDIA = 'media'
const WORSHIP = 'worship'

// A head, so the whole team's rota is on the page rather than one row.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'me' } },
    isAdmin: false,
    isDepartmentHead: (id: string) => id === MEDIA || id === WORSHIP,
  }),
}))

const assignment = (id: string, label: string, user: string | null, team: 'Media' | 'Worship' = 'Media') => ({
  id,
  service_id: 'svc',
  department_id: team === 'Media' ? MEDIA : WORSHIP,
  user_id: user,
  role_label: label,
  role_id: id,
  profile: user ? { id: user, first_name: 'Sam', last_name: 'Jones' } : null,
  department: team === 'Media' ? { id: MEDIA, name: 'Media', color: '#fff' } : { id: WORSHIP, name: 'Worship', color: '#f80' },
})

const rota = vi.fn()

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: MEDIA, name: 'Media', color: '#fff', is_service_flow: false },
      { id: WORSHIP, name: 'Worship', color: '#f80', is_service_flow: false },
    ]),
  fetchServices: () =>
    Promise.resolve([{ id: 'svc', date: SUNDAY, service_type: 'English', created_at: '' }]),
  fetchRotaAssignments: () => Promise.resolve(rota()),
  fetchRoleChecklistItems: () => Promise.resolve([]),
  fetchRotaProgress: () => Promise.resolve([]),
  fetchOwnMemberships: () =>
    Promise.resolve(([MEDIA, WORSHIP]).map((department_id: string) => ({ department_id, member_type: 'core' }))),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}))
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({ isFinished: () => false, afterServiceOpenUntil: () => null, afterServiceOpensAt: () => null, startsAt: () => null, now: Date.now() }),
}))
// The pages' display preferences, at the app's own defaults.
vi.mock('../lib/appSettings', async () => {
  const { DISPLAY_DEFAULTS } = await import('../lib/display')
  return {
    useDisplay: () => DISPLAY_DEFAULTS,
    useAppSettings: () => ({ rota_window_days: 14 }),
  }
})

async function roleOrder() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChecklistsIndexPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  // The role's name on each card, in the order the cards are drawn.
  const cards = await screen.findAllByText(/^(Camera Operator|Sound Desk|Team Coordinator)/)
  return cards.map((el) => el.textContent)
}

describe('who leads a team\'s checklist', () => {
  /*
   * The Team Coordinator gives the last of the three signatures on every
   * row of their team's list, so it is the row a head looks for first —
   * the same reason the Teams page lifts the role above the groups.
   * Alphabetically it landed under T, at the bottom of a team whose other
   * roles start with C.
   */
  it('puts the Team Coordinator first when somebody holds it', async () => {
    rota.mockReturnValue([
      assignment('cam1', 'Camera Operator 1', 'a'),
      assignment('coord', 'Team Coordinator', 'b'),
      assignment('sound', 'Sound Desk', 'c'),
    ])
    expect(await roleOrder()).toEqual(['Team Coordinator', 'Camera Operator 1', 'Sound Desk'])
  })

  it('leaves an unheld one where its name puts it', async () => {
    // Nobody on it is nobody to sign, so there is nothing to look for.
    rota.mockReturnValue([
      assignment('cam1', 'Camera Operator 1', 'a'),
      assignment('coord', 'Team Coordinator', null),
      assignment('sound', 'Sound Desk', 'c'),
    ])
    expect(await roleOrder()).toEqual(['Camera Operator 1', 'Sound Desk', 'Team Coordinator'])
  })

  it('keeps each team together under its name, its coordinator first', async () => {
    // Sorted by role alone, the two teams' rows came out shuffled together.
    rota.mockReturnValue([
      assignment('w-bv1', 'Backing Vocal 1', 'a', 'Worship'),
      assignment('m-cam1', 'Camera Operator 1', 'b'),
      assignment('w-coord', 'Team Coordinator', 'c', 'Worship'),
      assignment('m-coord', 'Team Coordinator', 'd'),
      assignment('m-sound', 'Sound Desk', 'e'),
    ])
    const order = await roleOrder()
    expect(order).toEqual(['Team Coordinator', 'Camera Operator 1', 'Sound Desk', 'Team Coordinator'])
    const media = screen.getByRole('listitem', { name: 'Media', hidden: true })
    const worship = screen.getByRole('listitem', { name: 'Worship', hidden: true })
    expect(within(media).getAllByText(/Camera Operator|Sound Desk|Team Coordinator/).map((e) => e.textContent)).toEqual([
      'Team Coordinator',
      'Camera Operator 1',
      'Sound Desk',
    ])
    expect(within(worship).getByText('Team Coordinator')).toBeInTheDocument()
    expect(within(worship).getAllByText(/Backing Vocal|Team Coordinator/).map((e) => e.textContent)).toEqual([
      'Team Coordinator',
      'Backing Vocal 1',
    ])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

const SUNDAY = '2026-09-06'
const MEDIA = 'media'

// A head, so the whole team's rota is on the page rather than one row.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'me' } },
    isAdmin: false,
    isDepartmentHead: (id: string) => id === MEDIA,
  }),
}))

const assignment = (id: string, label: string, user: string | null) => ({
  id,
  service_id: 'svc',
  department_id: MEDIA,
  user_id: user,
  role_label: label,
  role_id: id,
  profile: user ? { id: user, first_name: 'Sam', last_name: 'Jones' } : null,
  department: { id: MEDIA, name: 'Media', color: '#fff' },
})

const rota = vi.fn()

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([{ id: MEDIA, name: 'Media', color: '#fff', is_service_flow: false }]),
  fetchServices: () =>
    Promise.resolve([{ id: 'svc', date: SUNDAY, service_type: 'English', created_at: '' }]),
  fetchRotaAssignments: () => Promise.resolve(rota()),
  fetchRoleChecklistItems: () => Promise.resolve([]),
  fetchRotaProgress: () => Promise.resolve([]),
  fetchOwnDepartmentIds: () => Promise.resolve([MEDIA]),
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
  useFinishedServices: () => ({ isFinished: () => false }),
}))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ rota_window_days: 14 }) }))

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
  const cards = await screen.findAllByText(/Camera Operator|Sound Desk|Team Coordinator/)
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
})

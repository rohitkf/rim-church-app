import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

/*
 * During the service (0260): a third part of a role's list, which opens
 * when the service starts rather than at the call time. Same setup as
 * ChecklistAfterService.test.tsx, with a "during" line on the list.
 */
const SUNDAY = '2026-09-06'
const MEDIA = 'media'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'me' } },
    isAdmin: false,
    isDepartmentHead: () => false,
  }),
}))

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([{ id: MEDIA, name: 'Media', color: '#fff', is_service_flow: false }]),
  fetchServices: () =>
    Promise.resolve([{ id: 'svc', date: SUNDAY, service_type: 'English', created_at: '' }]),
  fetchRotaAssignments: () =>
    Promise.resolve([
      {
        id: 'a1',
        service_id: 'svc',
        department_id: MEDIA,
        user_id: 'me',
        role_label: 'Camera Operator 1',
        role_id: 'cam1',
        profile: { id: 'me', first_name: 'Rohit', last_name: 'K' },
        department: { id: MEDIA, name: 'Media', color: '#fff' },
      },
    ]),
  fetchRoleChecklistItems: () =>
    Promise.resolve([
      {
        id: 'i1',
        role_id: 'cam1',
        department_id: MEDIA,
        label: 'Check batteries',
        sort_order: 0,
        phase: 'pre',
      },
      {
        id: 'i2',
        role_id: 'cam1',
        department_id: MEDIA,
        label: 'Pack the camera away',
        sort_order: 0,
        phase: 'post',
      },
      {
        id: 'i3',
        role_id: 'cam1',
        department_id: MEDIA,
        label: 'Start the recording',
        sort_order: 0,
        phase: 'during',
      },
    ]),
  fetchRotaProgress: () => Promise.resolve([]),
  fetchOwnMemberships: () =>
    Promise.resolve(([MEDIA]).map((department_id: string) => ({ department_id, member_type: 'core' }))),
}))

// The call time itself: Media is due at half six that morning.
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [{ department_id: MEDIA, on_date: SUNDAY, call_time: '06:30:00' }],
            error: null,
          }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}))

const clock = vi.hoisted(() => ({
  ended: true,
  openUntil: null as number | null,
  opensAt: null as number | null,
  startsAt: null as string | null,
}))
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({
    isFinished: () => clock.ended,
    afterServiceOpenUntil: () => clock.openUntil,
    afterServiceOpensAt: () => clock.opensAt,
    startsAt: () => clock.startsAt,
    now: Date.now(),
  }),
}))

// The pages' display preferences, at the app's own defaults.
vi.mock('../lib/appSettings', async () => {
  const { DISPLAY_DEFAULTS } = await import('../lib/display')
  return {
    useDisplay: () => DISPLAY_DEFAULTS,
    useAppSettings: () => ({ rota_window_days: 14, after_service_checklist_minutes: 120, after_service_checklist_opens_minutes: 20 }),
  }
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChecklistsIndexPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.useRealTimers())

describe('the during-the-service checklist', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    clock.ended = false
    clock.openUntil = null
    clock.opensAt = null
    clock.startsAt = new Date(`${SUNDAY}T10:00:00`).toISOString()
  })

  it('sits between the before and after parts', async () => {
    vi.setSystemTime(new Date(`${SUNDAY}T09:00:00`))
    show()
    await screen.findByText('Start the recording')
    const headings = screen.getAllByText(/^(Before|During|After) the service$/).map((el) => el.textContent)
    expect(headings).toEqual(['Before the service', 'During the service', 'After the service'])
  })

  it('stays shut until the service starts, while the before part is open, and says when it opens', async () => {
    vi.setSystemTime(new Date(`${SUNDAY}T09:00:00`))
    show()
    const during = (await screen.findByText('Start the recording')).closest('li')!
    const batteries = screen.getByText('Check batteries').closest('li')!
    expect(within(during).getByRole('checkbox', { name: /Done/ })).toBeDisabled()
    expect(within(batteries).getByRole('checkbox', { name: /Done/ })).toBeEnabled()
    expect(screen.getByText(/Opens when the service starts, at/)).toBeInTheDocument()
  })

  it('opens once the service has started', async () => {
    vi.setSystemTime(new Date(`${SUNDAY}T10:15:00`))
    show()
    const during = (await screen.findByText('Start the recording')).closest('li')!
    await waitFor(() => expect(within(during).getByRole('checkbox', { name: /Done/ })).toBeEnabled())
    expect(screen.queryByText(/Opens when the service starts/)).toBeNull()
  })

  it('opens with the before part when the service has no start time', async () => {
    vi.setSystemTime(new Date(`${SUNDAY}T07:00:00`))
    clock.startsAt = null
    show()
    const during = (await screen.findByText('Start the recording')).closest('li')!
    expect(within(during).getByRole('checkbox', { name: /Done/ })).toBeEnabled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

/*
 * After the service, the packing-up half stays open for a while (0115)
 * and the setting-up half does not.
 *
 * Adapted from ChecklistWindow.test: the whole point of the window: a box that cannot be ticked from an
 * armchair, and a page that says when it can be.
 *
 * The clock is frozen on the morning of the service and moved across the
 * team's call time, which is the only interesting line in the day.
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
    ]),
  fetchRotaProgress: () => Promise.resolve([]),
  fetchOwnDepartmentIds: () => Promise.resolve([MEDIA]),
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

const clock = vi.hoisted(() => ({ openUntil: null as number | null }))
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({
    isFinished: () => true,
    afterServiceOpenUntil: () => clock.openUntil,
  }),
}))

vi.mock('../lib/appSettings', () => ({
  useAppSettings: () => ({ rota_window_days: 14, after_service_checklist_minutes: 120 }),
}))

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

describe('the after-the-service checklist', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(`${SUNDAY}T13:30:00`))
  })

  it('stays open after the service has ended, while the before half is closed', async () => {
    clock.openUntil = new Date(`${SUNDAY}T15:00:00`).getTime()
    show()
    expect(await screen.findByText('Pack the camera away')).toBeInTheDocument()
    expect(screen.getByText(/checklist stays\s+open until/)).toBeInTheDocument()

    const pack = screen.getByText('Pack the camera away').closest('li')!
    const batteries = screen.getByText('Check batteries').closest('li')!
    expect(within(pack).getByRole('checkbox', { name: /Done/ })).toBeEnabled()
    expect(within(batteries).getByRole('checkbox', { name: /Done/ })).toBeDisabled()
  })

  it('folds the service away once that window has closed too', async () => {
    clock.openUntil = null
    show()
    await waitFor(() => expect(screen.getByText(/Finished · closed/)).toBeInTheDocument())
    expect(screen.queryByText(/stays\s+open until/)).not.toBeInTheDocument()
  })
})

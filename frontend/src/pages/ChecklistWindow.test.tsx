import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

/*
 * The whole point of the window: a box that cannot be ticked from an
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

vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({ isFinished: () => false }),
}))

vi.mock('../lib/appSettings', () => ({
  useAppSettings: () => ({ rota_window_days: 14 }),
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

function freezeAt(iso: string) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(iso))
}

afterEach(() => vi.useRealTimers())

describe('a checklist that opens at the call time', () => {
  beforeEach(() => vi.clearAllMocks())

  it('will not be ticked before the team is called in, and says when it will', async () => {
    freezeAt(`${SUNDAY}T05:00:00`)
    show()

    expect(await screen.findByText('Check batteries')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByText(/opens at 06:30 on .*when your team is called in/i),
      ).toBeInTheDocument(),
    )
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeDisabled()
    }
  })

  it('opens once the call time has come', async () => {
    freezeAt(`${SUNDAY}T06:31:00`)
    show()

    expect(await screen.findByText('Check batteries')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText(/when your team is called in/i)).not.toBeInTheDocument(),
    )
    // The volunteer's own box is live; the two verification stages are not
    // theirs to give.
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[0]).toBeEnabled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

const state = vi.hoisted(() => ({ checkAll: true, calls: [] as unknown[] }))

// Only the one cell this is about: Check all (0232), the Owner's by default.
vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({ can: (cap: string) => (cap === 'day.check_all' ? state.checkAll : false) }),
}))
vi.mock('../lib/toast', () => ({ showToast: () => undefined }))

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
      { id: 'i2', role_id: 'cam1', department_id: MEDIA, label: 'Check the tripod', sort_order: 1, phase: 'pre' },
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
    rpc: (fn: string, args: unknown) => {
      state.calls.push([fn, args])
      return Promise.resolve({ data: { ticked: 2, skipped: 0 }, error: null })
    },
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
beforeEach(() => {
  state.checkAll = true
  state.calls = []
})

describe('Check all on a role', () => {
  it('ticks the whole open half in one go, for whoever the grid allows', async () => {
    freezeAt(`${SUNDAY}T06:31:00`)
    show()
    const button = await screen.findByRole('button', { name: 'Check all 2' })
    await userEvent.click(button)
    await waitFor(() => expect(state.calls).toEqual([['checklist_check_all', { p_assignment: 'a1', p_phase: 'pre' }]]))
  })

  it('is not there for anybody the grid does not allow', async () => {
    freezeAt(`${SUNDAY}T06:31:00`)
    state.checkAll = false
    show()
    expect(await screen.findByText('Check batteries')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Check all/ })).toBeNull()
  })

  it('waits for the call time like every box does', async () => {
    freezeAt(`${SUNDAY}T05:00:00`)
    show()
    expect(await screen.findByText('Check batteries')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Check all/ })).toBeNull()
  })
})

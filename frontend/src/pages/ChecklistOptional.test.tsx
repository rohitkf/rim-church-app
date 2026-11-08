import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsIndexPage } from './ChecklistsIndexPage'

const state = vi.hoisted(() => ({
  checkAll: true,
  calls: [] as unknown[],
  progress: [] as { id: string; assignment_id: string; item_id: string; status: string }[],
}))

// Only the one cell this is about: Check all (0232), the Owner's by default.
vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({ can: (cap: string) => (cap === 'day.check_all' ? state.checkAll : false) }),
}))
vi.mock('../lib/toast', () => ({ showToast: () => undefined }))

/*
 * An optional line (0259): written on the role's list, owed by nobody until
 * the person holding the role ticks it. Same page and setup as
 * ChecklistCheckAll.test.tsx, with a third, optional line on the list.
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
      {
        id: 'i3',
        role_id: 'cam1',
        department_id: MEDIA,
        label: 'Film a clip for socials',
        sort_order: 2,
        phase: 'pre',
        optional: true,
      },
    ]),
  fetchRotaProgress: () => Promise.resolve(state.progress),
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
  state.progress = []
})

describe('An optional checklist line', () => {
  it('says it is not counted until somebody takes it on', async () => {
    freezeAt(`${SUNDAY}T06:31:00`)
    show()
    expect(await screen.findByText('Film a clip for socials')).toBeInTheDocument()
    expect(screen.getByText('Optional · not counted')).toBeInTheDocument()
    expect(screen.getByText('0 of 2 ticked · 1 optional')).toBeInTheDocument()
  })

  it('is left out of Check all, which is the assignee\'s choice to make', async () => {
    freezeAt(`${SUNDAY}T06:31:00`)
    show()
    expect(await screen.findByRole('button', { name: 'Check all 2' })).toBeInTheDocument()
  })

  it('counts like any other line once the person holding the role has ticked it', async () => {
    freezeAt(`${SUNDAY}T06:31:00`)
    state.progress = [{ id: 'p1', assignment_id: 'a1', item_id: 'i3', status: 'member_complete' }]
    show()
    expect(await screen.findByText('1 of 3 ticked')).toBeInTheDocument()
    expect(screen.queryByText('Optional · not counted')).toBeNull()
    expect(screen.getByText('Optional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check all 3' })).toBeInTheDocument()
  })
})

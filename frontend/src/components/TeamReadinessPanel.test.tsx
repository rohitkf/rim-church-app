import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamReadinessPanel } from './TeamReadinessPanel'
import type { ReadinessRow } from '../lib/teamReadiness'

let me = 'joel'
let admin = false
let heads: string[] = []
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: me } },
    isAdmin: admin,
    isDepartmentHead: (d: string) => heads.includes(d),
  }),
}))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

const rpc = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }))

const rota = [
  { service_id: 's1', department_id: 'media', user_id: 'santhi', role_label: 'Team Coordinator' },
  { service_id: 's1', department_id: 'media', user_id: 'joel', role_label: 'Camera Operator 1' },
  { service_id: 's1', department_id: 'audio', user_id: 'rose', role_label: 'Sound' },
]
const departments = [
  { id: 'media', name: 'Media', color: '#a855f7' },
  { id: 'audio', name: 'Audio', color: '#ef4444' },
]
const green = (department_id: string): ReadinessRow => ({
  service_id: 's1',
  department_id,
  ready: true,
  marked_at: '2026-09-27T08:42:00Z',
  marker: { first_name: 'Santhi', last_name: 'Chennamsetti' },
})

function show(rows: ReadinessRow[] = [], finished = false) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <TeamReadinessPanel serviceId="s1" finished={finished} assignments={rota} departments={departments} rows={rows} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  me = 'joel'
  admin = false
  heads = []
  rpc.mockClear()
})

describe('the ready-for-service panel on the Checklists page', () => {
  it('shows every serving team red until somebody marks it', () => {
    show()
    expect(screen.getAllByRole('img', { name: 'Not ready' })).toHaveLength(2)
    expect(screen.getByText('0/2 teams ready')).toBeInTheDocument()
    expect(screen.queryByText('Ready for service')).toBeNull()
  })

  it('offers no switch to somebody who only has a role on the team', () => {
    show()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('offers the Team Coordinator their own team’s switch, and only that one', async () => {
    me = 'santhi'
    const user = show()
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(1)
    expect(switches[0]).toHaveAccessibleName('Media ready for service')
    await user.click(switches[0])
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_team_ready', { service: 's1', department: 'media', is_ready: true }),
    )
  })

  it('offers a Head their team, and an Admin every team', () => {
    heads = ['audio']
    show()
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['Audio ready for service'])
  })

  it('says who marked a team ready', () => {
    show([green('media')])
    expect(screen.getByText(/Ready · marked by Santhi Chennamsetti/)).toBeInTheDocument()
  })

  it('turns a green team back to red', async () => {
    admin = true
    const user = show([green('media')])
    await user.click(screen.getByRole('switch', { name: 'Media ready for service' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_team_ready', { service: 's1', department: 'media', is_ready: false }),
    )
  })

  it('says READY FOR SERVICE once every team is green', () => {
    show([green('media'), green('audio')])
    expect(screen.getByRole('status')).toHaveTextContent('Ready for service')
    expect(screen.getAllByRole('img', { name: 'Ready' })).toHaveLength(2)
  })

  it('stops the switches once the service has finished', () => {
    admin = true
    show([], true)
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

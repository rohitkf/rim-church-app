import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

const mockSession = {
  user: { id: 'user-1' },
  access_token: 'token',
}

const mockRoles = [
  { id: 'r1', role_type: 'department_head', department_id: 'dept-media', service_id: null },
  { id: 'r2', role_type: 'assisting_head', department_id: 'dept-worship', service_id: null },
  { id: 'r3', role_type: 'service_flow_coordinator', department_id: null, service_id: 'svc-1' },
]

const mockProfile = {
  id: 'user-1',
  first_name: 'Sarah',
  last_name: 'Jenkins',
  dob: null,
  email: 's@x.com',
  phone: null,
  avatar_url: null,
}

vi.mock('../lib/supabaseClient', () => {
  function chain(result: unknown) {
    const builder: Record<string, unknown> = {}
    const self = () => builder
    builder.select = self
    builder.eq = self
    builder.single = () => Promise.resolve({ data: result, error: null })
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null })
    return builder
  }

  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: mockSession } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve(),
      },
      from: (table: string) => (table === 'profiles' ? chain(mockProfile) : chain(mockRoles)),
    },
  }
})

function Probe() {
  const { loading, profile, isAdmin, hasRole, isDepartmentHead, isServiceCoordinator } = useAuth()
  if (loading) return <div>loading</div>
  return (
    <div>
      <div data-testid="name">{profile?.first_name}</div>
      <div data-testid="is-admin">{String(isAdmin)}</div>
      <div data-testid="head-of-media">{String(isDepartmentHead('dept-media'))}</div>
      <div data-testid="head-of-worship">{String(isDepartmentHead('dept-worship'))}</div>
      <div data-testid="head-of-audio">{String(isDepartmentHead('dept-audio'))}</div>
      <div data-testid="coordinator-of-svc1">{String(isServiceCoordinator('svc-1'))}</div>
      <div data-testid="coordinator-of-svc2">{String(isServiceCoordinator('svc-2'))}</div>
      <div data-testid="any-dept-head">{String(hasRole('department_head'))}</div>
    </div>
  )
}

describe('AuthContext role checks', () => {
  it('derives per-department and per-service permission checks from the loaded roles', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Sarah'))

    // department_head on dept-media -> full head rights there
    expect(screen.getByTestId('head-of-media')).toHaveTextContent('true')
    // assisting_head on dept-worship also counts as "department head or assisting" for gating
    expect(screen.getByTestId('head-of-worship')).toHaveTextContent('true')
    // no role at all on dept-audio
    expect(screen.getByTestId('head-of-audio')).toHaveTextContent('false')
    // coordinator only for the specific service they're scoped to
    expect(screen.getByTestId('coordinator-of-svc1')).toHaveTextContent('true')
    expect(screen.getByTestId('coordinator-of-svc2')).toHaveTextContent('false')
    // not an admin
    expect(screen.getByTestId('is-admin')).toHaveTextContent('false')
    // hasRole with no scope opts matches on role_type alone, regardless of department
    expect(screen.getByTestId('any-dept-head')).toHaveTextContent('true')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

const mockSession = {
  user: { id: 'user-1' },
  access_token: 'token',
}

const mockRoles = [
  { id: 'r1', role_type: 'department_head', department_id: 'dept-media', service_id: null },
  { id: 'r2', role_type: 'assisting_head', department_id: 'dept-worship', service_id: null },
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

// Lets one test make the session lookup fail the way a sleeping project or
// a dropped connection would.
const control = vi.hoisted(() => ({
  getSession: () => Promise.resolve({ data: { session: null as unknown } }),
}))

vi.mock('../lib/supabaseClient', () => {
  function chain(result: unknown) {
    const builder: Record<string, unknown> = {}
    const self = () => builder
    builder.select = self
    builder.eq = self
    builder.single = () => Promise.resolve({ data: result, error: null })
    builder.maybeSingle = () => Promise.resolve({ data: result, error: null })
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null })
    return builder
  }

  return {
    supabase: {
      auth: {
        getSession: () => control.getSession(),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve(),
      },
      from: (table: string) => {
        if (table === 'profiles') return chain(mockProfile)
        // The app asks who owns it at sign-in; nobody does, in these tests.
        if (table === 'app_owner') return chain(null)
        return chain(mockRoles)
      },
    },
  }
})

function Probe() {
  const { loading, profile, isAdmin, hasRole, isDepartmentHead } = useAuth()
  if (loading) return <div>loading</div>
  return (
    <div>
      <div data-testid="name">{profile?.first_name}</div>
      <div data-testid="is-admin">{String(isAdmin)}</div>
      <div data-testid="head-of-media">{String(isDepartmentHead('dept-media'))}</div>
      <div data-testid="head-of-worship">{String(isDepartmentHead('dept-worship'))}</div>
      <div data-testid="head-of-audio">{String(isDepartmentHead('dept-audio'))}</div>
      <div data-testid="any-dept-head">{String(hasRole('department_head'))}</div>
    </div>
  )
}

beforeEach(() => {
  control.getSession = () => Promise.resolve({ data: { session: mockSession } })
})

describe('AuthContext role checks', () => {
  it('derives per-department permission checks from the loaded roles', async () => {
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
    // not an admin
    expect(screen.getByTestId('is-admin')).toHaveTextContent('false')
    // hasRole with no scope opts matches on role_type alone, regardless of department
    expect(screen.getByTestId('any-dept-head')).toHaveTextContent('true')
  })
})

describe('when the session cannot be read at all', () => {
  it('stops loading and reports why, instead of spinning for ever', async () => {
    // A sleeping Supabase project, dead DNS, a phone that lost signal
    // between the tap and the request. Whatever the cause, the app has to
    // come out of its loading state and say something.
    control.getSession = () => Promise.reject({ message: 'Failed to fetch' })

    function ErrorProbe() {
      const { loading, authError, session } = useAuth()
      return (
        <div>
          <div data-testid="loading">{String(loading)}</div>
          <div data-testid="error">{authError ?? ''}</div>
          <div data-testid="session">{String(!!session)}</div>
        </div>
      )
    }

    render(
      <AuthProvider>
        <ErrorProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch')
    expect(screen.getByTestId('session')).toHaveTextContent('false')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthContext } from '../auth/AuthContext'

const resetApp = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../lib/resetApp', () => ({ resetApp }))
// Its own tests (pages/JoiningPage*.test.tsx); here only which form, if any.
vi.mock('../pages/JoiningPage', () => ({
  JoiningPage: ({ completing = false }: { completing?: boolean }) => (
    <p>{completing ? 'the form, completing' : 'the form, joining'}</p>
  ),
}))

function renderStuck() {
  const value = {
    session: null,
    profile: null,
    roles: [],
    loading: true,
    authError: null,
    isAdmin: false,
    isSuperAdmin: false,
    ownerId: null,
    hasRole: () => false,
    isDepartmentHead: () => false,
    ledDepartmentIds: [],
    refreshProfile: async () => {},
    signOut: async () => {},
    isOverwatch: false,
    seesAllTeams: false,
    canPreview: false,
    previewCoordinates: null,
    viewAs: null,
    setViewAs: () => {},
  }

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <ProtectedRoute />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('the loading screen', () => {
  it('offers a way out once waiting stops looking like progress', async () => {
    vi.useFakeTimers()
    renderStuck()

    // Straight away it is just a wait, and says so quietly.
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    const button = screen.getByRole('button', { name: /clear this app/i })
    expect(screen.getByText(/taking longer than it should/i)).toBeInTheDocument()

    button.click()
    expect(resetApp).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

/*
 * The door: who gets the joining form in place of the app (0097, 0276).
 */
describe('who is held at the joining form', () => {
  const someone = { id: 'u1', first_name: 'Grace', last_name: 'Mensah', email: 'g@example.com', phone: null, dob: null, avatar_url: null }

  function renderAs(profile: Record<string, unknown>, profileGaps?: string[] | null) {
    const value = {
      session: { user: { id: 'u1' } },
      profile,
      profileGaps,
      roles: [],
      loading: false,
      authError: null,
      isAdmin: false,
      isSuperAdmin: false,
      ownerId: null,
      hasRole: () => false,
      isDepartmentHead: () => false,
      ledDepartmentIds: [],
      refreshProfile: async () => {},
      signOut: async () => {},
      isOverwatch: false,
      seesAllTeams: false,
      canPreview: false,
      previewCoordinates: null,
      viewAs: null,
      setViewAs: () => {},
    }
    return render(
      <MemoryRouter>
        <AuthContext.Provider value={value as never}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="*" element={<p>the app</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  }

  it('holds somebody who has never been through it', () => {
    renderAs({ ...someone, onboarded_at: null }, ['phone', 'dob'])
    expect(screen.getByText('the form, joining')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('holds somebody already in who has a question unanswered, with the form that says so', () => {
    renderAs({ ...someone, onboarded_at: '2026-01-01T00:00:00Z' }, ['dob'])
    expect(screen.getByText('the form, completing')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('lets in somebody with every question answered', () => {
    renderAs({ ...someone, onboarded_at: '2026-01-01T00:00:00Z' }, [])
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('shuts nobody out on a guess: not while the answer is unknown, nor when it could not be asked', () => {
    const first = renderAs({ ...someone, onboarded_at: '2026-01-01T00:00:00Z' }, null)
    expect(screen.getByText('the app')).toBeInTheDocument()
    first.unmount()
    renderAs({ ...someone, onboarded_at: '2026-01-01T00:00:00Z' }, undefined)
    expect(screen.getByText('the app')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthContext } from '../auth/AuthContext'

const resetApp = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../lib/resetApp', () => ({ resetApp }))

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

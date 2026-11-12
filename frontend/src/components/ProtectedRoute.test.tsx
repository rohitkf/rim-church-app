import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthContext } from '../auth/AuthContext'

const resetApp = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../lib/resetApp', () => ({ resetApp }))
// Whether the app is open to this person (lib/useStanding has its own tests):
// open and decided, unless a test says otherwise.
const standing = vi.hoisted(() =>
  vi.fn(() => ({ standing: null as unknown, deciding: false, checking: false, recheck: () => {} })),
)
vi.mock('../lib/useStanding', () => ({ useStanding: () => standing() }))
// Starting the app again is a page reload, which a test can only watch being asked for.
const reloadApp = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadApp', () => ({ reloadApp }))
// Its own tests (pages/JoiningPage*.test.tsx); here only which form, if any.
vi.mock('../pages/JoiningPage', () => ({
  JoiningPage: ({ completing = false }: { completing?: boolean }) => (
    <p>{completing ? 'the form, completing' : 'the form, joining'}</p>
  ),
}))

beforeEach(() => {
  standing.mockReturnValue({ standing: null, deciding: false, checking: false, recheck: () => {} })
  reloadApp.mockClear()
})

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

/*
 * Closed for maintenance (0278): the page that says so stands in for the
 * whole app, for everybody the database is turning away.
 */
describe('when the app is closed for maintenance', () => {
  const closed = { title: 'App maintenance', body: 'Moving servers.', from: '2026-11-15T09:00:00Z', until: '2026-11-16T09:00:00Z' }

  function signedIn() {
    const value = {
      session: { user: { id: 'u1' } },
      profile: null,
      profileGaps: null,
      loading: false,
      authError: null,
      signOut: async () => {},
    }
    return (
      <MemoryRouter>
        <AuthContext.Provider value={value as never}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="*" element={<p>the app</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    )
  }
  const renderSignedIn = () => render(signedIn())

  it('shows the closed page instead of the app, with why and until when', () => {
    standing.mockReturnValue({ standing: { closed, may_enter: false }, deciding: false, checking: false, recheck: () => {} })
    renderSignedIn()
    expect(screen.getByRole('heading', { name: 'App maintenance' })).toBeInTheDocument()
    expect(screen.getByText('Moving servers.')).toBeInTheDocument()
    expect(screen.getByText(/opens again on/)).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('shows a blocked account the page that says so, and none of the app', () => {
    standing.mockReturnValue({
      standing: { closed: null, may_enter: true, blocked: { at: '2026-11-11T15:42:00Z' } },
      deciding: false,
      checking: false,
      recheck: () => {},
    })
    renderSignedIn()
    expect(screen.getByRole('heading', { name: 'Your account has been blocked by an administrator' })).toBeInTheDocument()
    expect(screen.getByText(/contact a church Admin/)).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('says blocked, not closed, to somebody who is both: it will still be true tomorrow', () => {
    standing.mockReturnValue({
      standing: { closed, may_enter: false, blocked: { at: '2026-11-11T15:42:00Z' } },
      deciding: false,
      checking: false,
      recheck: () => {},
    })
    renderSignedIn()
    expect(screen.getByText('Account blocked')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'App maintenance' })).toBeNull()
  })

  it('blocks even somebody who may keep working while the app is closed', () => {
    standing.mockReturnValue({
      standing: { closed, may_enter: true, blocked: { at: '2026-11-11T15:42:00Z' } },
      deciding: false,
      checking: false,
      recheck: () => {},
    })
    renderSignedIn()
    expect(screen.getByText('Account blocked')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('starts the app afresh when a block is lifted, rather than drawing it with what was refused', () => {
    const blockedStanding = { closed: null, may_enter: true, blocked: { at: '2026-11-11T15:42:00Z' } }
    standing.mockReturnValue({ standing: blockedStanding, deciding: false, checking: false, recheck: () => {} })
    const view = renderSignedIn()
    expect(screen.getByText('Account blocked')).toBeInTheDocument()
    expect(reloadApp).not.toHaveBeenCalled()

    standing.mockReturnValue({ standing: { closed: null, may_enter: true, blocked: null }, deciding: false, checking: false, recheck: () => {} })
    view.rerender(signedIn())
    expect(reloadApp).toHaveBeenCalledTimes(1)
    // Not the app with nobody's name on it while the page turns over.
    expect(screen.queryByText('the app')).toBeNull()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('starts the app afresh when a closure ends for somebody who was kept out', () => {
    standing.mockReturnValue({ standing: { closed, may_enter: false, blocked: null }, deciding: false, checking: false, recheck: () => {} })
    const view = renderSignedIn()
    standing.mockReturnValue({ standing: { closed: null, may_enter: true, blocked: null }, deciding: false, checking: false, recheck: () => {} })
    view.rerender(signedIn())
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('reloads nothing for somebody who was never kept out', () => {
    standing.mockReturnValue({ standing: { closed, may_enter: true, blocked: null }, deciding: false, checking: false, recheck: () => {} })
    const view = renderSignedIn()
    standing.mockReturnValue({ standing: { closed: null, may_enter: true, blocked: null }, deciding: false, checking: false, recheck: () => {} })
    view.rerender(signedIn())
    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(reloadApp).not.toHaveBeenCalled()
  })

  it('lets in whoever may keep working', () => {
    standing.mockReturnValue({ standing: { closed, may_enter: true }, deciding: false, checking: false, recheck: () => {} })
    renderSignedIn()
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('waits, briefly, for the first answer rather than drawing an app the database is refusing', () => {
    standing.mockReturnValue({ standing: null, deciding: true, checking: true, recheck: () => {} })
    renderSignedIn()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('keeps nobody out because it could not ask', () => {
    standing.mockReturnValue({ standing: null, deciding: false, checking: false, recheck: () => {} })
    renderSignedIn()
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('never shows it to somebody signed out: they are sent to sign in', () => {
    standing.mockReturnValue({ standing: { closed, may_enter: false }, deciding: false, checking: false, recheck: () => {} })
    render(
      <MemoryRouter initialEntries={['/rota']}>
        <AuthContext.Provider value={{ session: null, loading: false, authError: null, profile: null } as never}>
          <Routes>
            <Route path="/login" element={<p>sign in</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="*" element={<p>the app</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByText('sign in')).toBeInTheDocument()
  })
})

/*
 * A link somebody was sent — a poll, a notification — opened while signed
 * out. They are sent to sign in, and the sign-in page is told where they
 * were going, so the link still leads there afterwards. It used to forget.
 */
describe('somebody signed out who was headed somewhere', () => {
  function Where() {
    const { state } = useLocation()
    return <p data-testid="from">{JSON.stringify(state)}</p>
  }
  const open = (path: string) => {
    standing.mockReturnValue({ standing: null, deciding: false, checking: false, recheck: () => {} })
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={{ session: null, loading: false, authError: null, profile: null } as never}>
          <Routes>
            <Route path="/login" element={<Where />} />
            <Route element={<ProtectedRoute />}>
              <Route path="*" element={<p>the app</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  }

  it('is sent to sign in with the place remembered, what follows the path included', () => {
    open('/polls?poll=q1')
    expect(screen.getByTestId('from')).toHaveTextContent('{"from":"/polls?poll=q1"}')
  })

  it('carries nothing for the Dashboard: that is where sign-in leads anyway', () => {
    open('/')
    expect(screen.getByTestId('from')).toHaveTextContent('null')
  })
})

import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { resetApp } from '../lib/resetApp'

/** How long "Loading…" may stand on its own before it owes an explanation. */
const PATIENCE_MS = 5_000

function ResetButton({ children }: { children: React.ReactNode }) {
  const [resetting, setResetting] = useState(false)
  return (
    <button
      type="button"
      disabled={resetting}
      onClick={() => {
        setResetting(true)
        void resetApp()
      }}
      className="mt-3 rounded-full border border-outline px-4 py-2 text-body-sm font-medium disabled:opacity-60"
    >
      {resetting ? 'Clearing…' : children}
    </button>
  )
}

export function ProtectedRoute() {
  const { session, loading, authError } = useAuth()

  // A spinner with no end is the worst thing a page can do: it looks like
  // progress, so people wait instead of acting. If the session could not be
  // read at all, say so and offer the one thing that might help.
  if (authError && !session) {
    return (
      <div className="flex min-h-[60svh] items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-headline-md">Can&rsquo;t reach the server</h1>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Your connection or the service is unavailable, so we couldn&rsquo;t check whether
            you&rsquo;re signed in.
          </p>
          <p className="mt-2 font-mono text-label-sm text-on-surface-variant">{authError}</p>
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary"
            >
              Try again
            </button>
            <ResetButton>Clear this app&rsquo;s data and reload</ResetButton>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <LoadingScreen />

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}

/**
 * Waiting, and then admitting it.
 *
 * A spinner that never ends looks like progress, so people wait instead of
 * acting. After a few seconds this one says that something is wrong and
 * offers the two things that actually fix it — a fresh try, and dropping
 * the service worker and caches that an older deploy may have left behind.
 */
function LoadingScreen() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), PATIENCE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4 text-center">
      <div className="max-w-sm">
        <p className="text-body-sm text-on-surface-variant">Loading&hellip;</p>
        {slow && (
          <>
            <p className="mt-3 text-body-sm text-on-surface-variant">
              This is taking longer than it should. If it doesn&rsquo;t come back, clearing the
              app&rsquo;s stored copy usually fixes it &mdash; nothing you&rsquo;ve saved is kept
              there.
            </p>
            <ResetButton>Clear this app&rsquo;s data and reload</ResetButton>
          </>
        )}
      </div>
    </div>
  )
}

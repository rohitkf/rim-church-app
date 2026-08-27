import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-on-surface-variant">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}

import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { reloadApp } from '../lib/reloadApp'
import { resetApp } from '../lib/resetApp'
import { JoiningPage } from '../pages/JoiningPage'
import { BlockedPage } from '../pages/BlockedPage'
import { ClosedPage } from '../pages/ClosedPage'
import { isShutOut } from '../lib/standing'
import { useStanding } from '../lib/useStanding'

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
  const { session, loading, authError, profile, profileGaps } = useAuth()
  // Whether the app is open to this person right now (0278, 0279, lib/standing).
  const { standing, deciding, checking, recheck } = useStanding(session?.user.id ?? null)

  /*
   * Shut out a moment ago, let in now: the block was taken back, or the
   * maintenance ended. Everything the app read while it was being refused
   * is missing — who this is, their roles, every page's data — and it was
   * read by more than one thing, so the app does not try to mend itself
   * piece by piece: it starts again from a clean page, which is what
   * somebody would do by hand if it did not.
   *
   * Remembered in state, not a ref, so the render that notices is the one
   * that stops drawing the app with nobody's name on it.
   */
  const shutOut = !!session && isShutOut(standing)
  const [wasShutOut, setWasShutOut] = useState(false)
  if (shutOut && !wasShutOut) setWasShutOut(true)
  const reopening = wasShutOut && !shutOut && !!session
  useEffect(() => {
    if (reopening) reloadApp()
  }, [reopening])

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
              className="mt-5 rounded-full bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary"
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

  /*
   * Closed for maintenance, and this person is not one of those who may
   * keep working: the page that says so stands in for the whole app.
   *
   * Before everything below, because everything below reads the database
   * and the database is refusing them. The wait for the first answer is
   * short and has an end (useStanding): not being able to ask is never a
   * reason to keep somebody out.
   */
  if (deciding || reopening) return <LoadingScreen />
  // Blocked by name (0279) comes first: it is about this person, and it
  // will still be true when the maintenance is over.
  if (standing?.blocked) {
    return (
      <BlockedPage blocked={standing.blocked} email={session.user.email ?? null} checking={checking} onRetry={recheck} />
    )
  }
  if (standing?.closed && isShutOut(standing)) {
    return <ClosedPage closed={standing.closed} checking={checking} onRetry={recheck} />
  }

  /*
   * Somebody who has not finished joining gets the joining form, whichever
   * page they asked for.
   *
   * It sits here rather than on a route of its own because it is not a
   * destination: there is nothing to navigate to it from and no way past
   * it, and a route could be typed around. Everybody already using the app
   * was stamped as done by the migration that added it, so this is only
   * ever the first few minutes of somebody's first day.
   *
   * `profile` is null for a moment while it loads, and a null profile is
   * not a reason to demand anything — it would flash this form at
   * everybody on every cold start.
   */
  if (profile && !profile.onboarded_at) return <JoiningPage />

  /*
   * And so does somebody who went through before the form existed, or
   * before it asked what it asks now, and has a blank where the church
   * needs an answer (0276). The same form, with what they gave already in
   * it and the blanks marked — the joining form's rule held for everybody,
   * not a second, softer one for whoever was early.
   *
   * `profileGaps` is null until the database has answered, and when it
   * could not be asked. Neither is "incomplete": only a list with
   * something in it closes the door.
   */
  if (profile && profileGaps && profileGaps.length > 0) return <JoiningPage completing />

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

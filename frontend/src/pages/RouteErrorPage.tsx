import { useEffect } from 'react'
import { useLocation, useNavigate, useRouteError } from 'react-router-dom'
import { BrokenPageScreen, NotFoundScreen, StalePageScreen } from '../components/ErrorScreen'
import { errorSummary, mayReloadOnce, pageErrorKind } from '../lib/pageErrors'
import { reloadApp } from '../lib/reloadApp'

/**
 * What the router shows when a route fails: its code would not download,
 * or it threw while it was drawn.
 *
 * Without this the router shows its own screen, which is written for a
 * developer ("Unexpected Application Error!", the raw message, a note
 * about providing an errorElement). This is that errorElement, on the
 * root route, so it stands for every page.
 *
 * A stale page reloads by itself, once (lib/pageErrors): somebody whose
 * tab is a release behind gets the page they asked for and never sees
 * this. If the reload did not help, they do, with the button.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const kind = pageErrorKind(error)

  useEffect(() => {
    if (kind === 'stale' && mayReloadOnce()) reloadApp()
  }, [kind])

  useEffect(() => {
    if (kind === 'broken') console.error('A page failed to render:', error)
  }, [kind, error])

  if (kind === 'not-found') return <NotFoundScreen path={pathname} onBack={() => navigate(-1)} />
  if (kind === 'stale') return <StalePageScreen onDashboard={pathname === '/'} />
  return <BrokenPageScreen path={pathname} summary={errorSummary(error)} />
}

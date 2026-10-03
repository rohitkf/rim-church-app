import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePageAccess } from '../lib/usePageAccess'

/**
 * The pages a church can close to some of its people.
 *
 * Hiding them from the menu is most of the job and not all of it — a link
 * somebody was sent, or an address they remember, would still open a page
 * of empty panels. This turns those back to the dashboard. Which pages,
 * and for whom, is the church's choice (Settings › Access & privileges,
 * lib/pageAccess); the database refuses the same rows either way wherever
 * it can (0123), and this is so nobody meets that refusal as a blank
 * screen.
 *
 * It replaced TeamOnlyRoute, which could only ever say "teams".
 */
export function PageGate() {
  const { pathname } = useLocation()
  const { canOpen, settled } = usePageAccess()

  // Nothing at all until the roster and the settings are known. A redirect
  // on a guess sends somebody away from a page they may open.
  if (!settled) return null
  if (!canOpen(pathname)) return <Navigate to="/" replace />
  return <Outlet />
}

import { Navigate } from 'react-router-dom'
import { usePageAccess } from '../lib/usePageAccess'

/**
 * Where /serving goes now.
 *
 * For a month the menu had one Serving entry that held Availability, Team
 * Rota and Checklists as tabs. They are pages of their own again, and
 * nothing in the app links here any more — but a bookmark, a home-screen
 * shortcut or a link in an old message might. It opens the first of the
 * three this person may open, so a Church Member the rota is open to
 * lands on the rota rather than on a page that is not theirs.
 */
export function OldServingLink() {
  const { canOpen, settled } = usePageAccess()
  if (!settled) return <p className="text-body-sm text-on-surface-variant">Loading…</p>
  return <Navigate to={['/availability', '/rota', '/checklists'].find(canOpen) ?? '/'} replace />
}

import { useLocation, useNavigate } from 'react-router-dom'
import { NotFoundScreen } from '../components/ErrorScreen'

/**
 * No page at this address.
 *
 * The route of last resort: whatever nothing else matched. It shows the
 * address that was asked for, because the commonest cause is a link cut
 * short or a letter mistyped and the person can see which, and it has the
 * way back to the Dashboard. "Go back" is offered only where there is
 * somewhere to go back to — a link opened in a fresh tab has no history,
 * and a button that does nothing is worse than none.
 */
export function NotFoundPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // React Router numbers this tab's entries; the first is 0.
  const hasHistory = typeof window !== 'undefined' && Number((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  return <NotFoundScreen path={pathname} onBack={hasHistory ? () => navigate(-1) : undefined} />
}

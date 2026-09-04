import { Navigate, Outlet } from 'react-router-dom'
import { useMyTeams } from '../lib/useMyTeams'

/**
 * Pages that belong to the teams: the register, the notice board, the team
 * chat.
 *
 * Hiding them from the dock is most of the job and not all of it — a link
 * somebody was sent, or an address they remember, would still open a page
 * of empty panels. This turns those back to the dashboard, which is where
 * a new member's own information is.
 *
 * The database refuses the same rows either way (migration 0080); this is
 * so nobody meets that refusal as a blank screen.
 */
export function TeamOnlyRoute() {
  const { onATeam, settled } = useMyTeams()

  // Nothing at all until the roster is known. A redirect on a guess sends
  // a member who is on a team back to the dashboard mid-navigation.
  if (!settled) return null
  if (!onATeam) return <Navigate to="/" replace />
  return <Outlet />
}

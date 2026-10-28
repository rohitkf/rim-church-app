import { useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import { useAppSettingsState } from './appSettings'
import { standingOf, type Standing } from './pageAccess'
import { pageOpening } from './pageOpening'
import { usePermissions } from './usePermissions'

/**
 * Whether the person in front of the screen may open a page, under this
 * church's choices — and who the app takes them to be.
 *
 * "View as" narrows this the way it narrows everything else (AuthContext
 * and useMyTeams already answer as the previewed profile), so an Admin
 * previewing a Church Member sees exactly the menu one would.
 *
 * `settled` is false until both the roster and the settings are known; a
 * page that turns people away waits for it, rather than sending a Church
 * Member home from a rota the church has opened to them.
 */
export function usePageAccess(): {
  standing: Standing
  canOpen: (path: string) => boolean
  settled: boolean
} {
  const { session, isAdmin, isSuperAdmin, isOverwatch, ledDepartmentIds, roles } = useAuth()
  const { onATeam, teamIds, settled: teamsSettled } = useMyTeams()
  const { settings, settled: settingsSettled } = useAppSettingsState()
  const standing = standingOf({
    isAdmin,
    isLead: ledDepartmentIds.some((id) => !!id),
    // Overwatch counts as on a team elsewhere (it is shown the teams'
    // pages); here only a real place on a roster does, or the pages the
    // church closed to Overwatch would open anyway.
    onATeam: isOverwatch && !isAdmin ? teamIds.length > 0 || ledDepartmentIds.some((id) => !!id) : onATeam,
  })
  const isPastor = (roles ?? []).some((r) => r.role_type === 'pastor')
  // Clock In opens to whoever the grid gives clockin.view (0209), grants
  // included, so the menu waits for the grid as well.
  const { can, query: permissions } = usePermissions()
  const clockInViewer = can('clockin.view')
  const permissionsSettled = !permissions || !permissions.isLoading
  const myId = session?.user.id
  const canOpen = useCallback(
    (path: string) =>
      pageOpening(
        path,
        {
          myId,
          standing,
          isAdmin,
          isOwner: isSuperAdmin,
          isOverwatch,
          isPastor,
          teamIds: [...teamIds, ...ledDepartmentIds],
          clockInViewer,
        },
        settings,
      ).open,
    [myId, standing, isAdmin, isSuperAdmin, isOverwatch, isPastor, teamIds, ledDepartmentIds, settings, clockInViewer],
  )
  return { standing, canOpen, settled: teamsSettled && settingsSettled && permissionsSettled }
}

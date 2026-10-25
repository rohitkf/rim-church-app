import { useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import { useAppSettingsState } from './appSettings'
import { mayOpen, standingOf, type PageAccess, type Standing } from './pageAccess'
import { overwatchOpens } from './overwatch'

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
  const { isAdmin, isOverwatch, ledDepartmentIds } = useAuth()
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
  const access = settings.page_access as PageAccess
  const scope = settings.issues_raise_scope
  // Overwatch opens what the church left open to it (Settings ›
  // Overwatch, 0187), and whatever its own teams would open besides.
  const watched = settings.overwatch_pages
  const canOpen = useCallback(
    (path: string) => mayOpen(path, standing, access, scope) || (isOverwatch && overwatchOpens(path, watched)),
    [standing, access, scope, isOverwatch, watched],
  )
  return { standing, canOpen, settled: teamsSettled && settingsSettled }
}

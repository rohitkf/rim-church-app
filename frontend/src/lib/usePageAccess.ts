import { useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import { useAppSettingsState } from './appSettings'
import { mayOpen, standingOf, type PageAccess, type Standing } from './pageAccess'

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
  const { isAdmin, ledDepartmentIds } = useAuth()
  const { onATeam, settled: teamsSettled } = useMyTeams()
  const { settings, settled: settingsSettled } = useAppSettingsState()
  const standing = standingOf({
    isAdmin,
    isLead: ledDepartmentIds.some((id) => !!id),
    onATeam,
  })
  const access = settings.page_access as PageAccess
  const scope = settings.issues_raise_scope
  const canOpen = useCallback(
    (path: string) => mayOpen(path, standing, access, scope),
    [standing, access, scope],
  )
  return { standing, canOpen, settled: teamsSettled && settingsSettled }
}

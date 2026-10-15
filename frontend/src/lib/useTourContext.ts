import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from './usePageAccess'
import { useMyTeams } from './useMyTeams'
import { usePermissions } from './usePermissions'
import { maySee, sectionFor } from './settingsSections'
import type { TourContext } from './tour'

/** Who is being toured, as the steps need to know them. */
export function useTourContext(): TourContext {
  const { profile, isAdmin, isSuperAdmin } = useAuth()
  const { canOpen } = usePageAccess()
  const { onATeam } = useMyTeams()
  const { can } = usePermissions()
  const firstName = profile?.first_name ?? ''
  return useMemo(
    () => ({
      firstName,
      onATeam,
      canOpen,
      // The same answer the Settings hall gives about its own doors.
      roomOpen: (path: string) => {
        const room = sectionFor(path)
        return !room || maySee(room, { isAdmin, isSuperAdmin, can })
      },
    }),
    [firstName, onATeam, canOpen, isAdmin, isSuperAdmin, can],
  )
}


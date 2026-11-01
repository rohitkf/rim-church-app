import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from './usePageAccess'
import { chaptersFor, startTour, stepsOf, tourStandingOf } from './tour'
import { useTourContext } from './useTourContext'

/**
 * Take the tour again, whenever you like — from the account menu.
 *
 * The whole thing for your standing as it is now — not only the parts
 * you have not seen — because asking for it means wanting to be walked
 * round, not wanting the app to decide what you have forgotten.
 */
export function useStartTour(): () => void {
  const { isSuperAdmin } = useAuth()
  const { standing } = usePageAccess()
  const ctx = useTourContext()

  return () => {
    const chapters = chaptersFor(tourStandingOf({ isOwner: isSuperAdmin, standing })).filter(
      (c) => stepsOf(c, ctx).length > 0,
    )
    startTour(chapters, 'manual')
  }
}

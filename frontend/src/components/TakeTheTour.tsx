import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from '../lib/usePageAccess'
import { chaptersFor, startTour, stepsOf, tourStandingOf } from '../lib/tour'
import { ActionButton, SectionTile } from './Surface'
import { useTourContext } from '../lib/useTourContext'

/**
 * Settings › Profile: take the tour again, whenever you like.
 *
 * The whole thing for your standing as it is now — not only the parts
 * you have not seen — because asking for it means wanting to be walked
 * round, not wanting the app to decide what you have forgotten.
 */
export function TakeTheTour() {
  const { isSuperAdmin } = useAuth()
  const { standing } = usePageAccess()
  const ctx = useTourContext()

  const start = () => {
    const chapters = chaptersFor(tourStandingOf({ isOwner: isSuperAdmin, standing })).filter(
      (c) => stepsOf(c, ctx).length > 0,
    )
    startTour(chapters, 'manual')
  }

  return (
    <SectionTile
      title="The tour"
      hint="A two-minute walk round the app, showing what you can do here. It takes you page by page; you can skip any part."
    >
      <ActionButton tone="quiet" size="sm" onClick={start}>
        Take the tour
      </ActionButton>
    </SectionTile>
  )
}

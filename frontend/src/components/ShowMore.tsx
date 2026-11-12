import type { ReactNode } from 'react'
import { ActionButton } from './Surface'

/**
 * The foot of a list that is drawn a screen at a time (lib/showMore.ts):
 * Show more while there is more, Show fewer once it has been opened up,
 * and one line that says where the list has got to.
 *
 * The line is a `status`, so pressing Show more is answered for somebody
 * who cannot see the rows arrive: "20 more, up to Sunday 6 December".
 */
export function ShowMore({
  left,
  expanded,
  onMore,
  onFewer,
  label,
  children,
}: {
  /** How many are still to come; none hides Show more. */
  left: number
  /** More than the first screen is showing: offer the way back. */
  expanded: boolean
  onMore: () => void
  onFewer: () => void
  /** What the list is, for the buttons' names: "events coming up". */
  label: string
  /** Where the list has got to. */
  children: ReactNode
}) {
  if (left === 0 && !expanded) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {left > 0 && (
        <ActionButton tone="quiet" onClick={onMore} aria-label={`Show more ${label}`}>
          Show more
        </ActionButton>
      )}
      {expanded && (
        <ActionButton tone="ghost" onClick={onFewer} aria-label={`Show fewer ${label}`}>
          Show fewer
        </ActionButton>
      )}
      <p role="status" className="min-w-0 text-label-md text-on-surface-faint">
        {children}
      </p>
    </div>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Chevron } from './Collapsible'

/**
 * The "Finished" heading, and everything under it.
 *
 * One section, worn identically by the planner, the rota, the checklists
 * and the availability tracker — because a person who learns that
 * finished services live at the foot of one page should not have to learn
 * it again on the next.
 *
 * Closed when the page is drawn, and it says how many are inside so
 * nobody has to open it to find out whether it is worth opening.
 */
export function FinishedServices({
  count,
  id,
  aside,
  children,
}: {
  count: number
  /** The panel's own id, for `aria-controls`. */
  id: string
  /** A note on the right of the heading — when the list clears, say. */
  aside?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
      >
        <span className="flex items-baseline gap-2 text-headline-md text-on-surface-variant">
          Finished
          <span className="font-mono text-label-sm text-on-surface-faint">{count}</span>
          <Chevron open={open} />
        </span>
        {aside}
      </button>
      <div id={id} hidden={!open} className="mt-3 flex flex-col gap-5">
        {children}
      </div>
    </section>
  )
}

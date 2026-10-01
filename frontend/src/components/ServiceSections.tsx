import type { ReactNode } from 'react'
import { FinishedServices } from './FinishedServices'
import type { SectionedServices } from '../lib/serviceSections'

/**
 * The four sections, drawn the same way on every page that lists
 * services: Today's services, Next service, Upcoming services, and
 * Finished services folded away at the foot.
 *
 * The page says how to draw a run of services (`render`), and which
 * sections it has at all — Debriefs has no Next or Upcoming, since
 * nothing can be written about a service that has not happened. An empty
 * section is left out rather than shown with nothing under it, except
 * that a page with nothing current says so once (`empty`).
 */
export function ServiceSections<T>({
  sections,
  render,
  has = { next: true, upcoming: true },
  empty,
  finishedId,
  finishedAside,
  finishedOpen = false,
}: {
  sections: SectionedServices<T>
  /** One run of services. `finished` is true for the folded section. */
  render: (services: T[], finished: boolean) => ReactNode
  has?: { next?: boolean; upcoming?: boolean }
  /** Said when there is nothing today, next or upcoming. */
  empty?: ReactNode
  finishedId: string
  finishedAside?: ReactNode
  /** Arrive with Finished open — for a link pointing inside it. */
  finishedOpen?: boolean
}) {
  const next = has.next ? sections.next : []
  const upcoming = has.upcoming ? sections.upcoming : []
  const nothingCurrent = sections.today.length + next.length + upcoming.length === 0

  return (
    <div className="mt-6 flex flex-col gap-8">
      {sections.today.length > 0 && (
        <Section label="Today’s services">{render(sections.today, false)}</Section>
      )}
      {next.length > 0 && <Section label="Next service">{render(next, false)}</Section>}
      {upcoming.length > 0 && <Section label="Upcoming services">{render(upcoming, false)}</Section>}
      {nothingCurrent && empty && <div className="text-body-sm text-on-surface-variant">{empty}</div>}
      {sections.finished.length > 0 && (
        <FinishedServices
          count={sections.finished.length}
          id={finishedId}
          label="Finished services"
          aside={finishedAside}
          defaultOpen={finishedOpen}
        >
          {render(sections.finished, true)}
        </FinishedServices>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className="text-headline-md text-on-surface">{label}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

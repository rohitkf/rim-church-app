import type { ReactNode } from 'react'
import { FinishedServices } from './FinishedServices'
import type { SectionedServices } from '../lib/serviceSections'
import { useDisplay } from '../lib/appSettings'

/**
 * The four sections, drawn the same way on every page that lists
 * services: Today's services (only on the day), Next service (the nearest
 * service day after today), then Upcoming services and Finished services,
 * both folded until opened — unless the church has said either should
 * start open (Settings › Dashboard & lists).
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
  const { lists } = useDisplay()
  const startOpen = finishedOpen || lists.finishedOpen
  const next = has.next ? sections.next : []
  const upcoming = has.upcoming ? sections.upcoming : []
  const nothingCurrent = sections.today.length + next.length + upcoming.length === 0

  return (
    <div className="mt-6 flex flex-col gap-8">
      {sections.today.length > 0 && (
        <Section label="Today’s services">{render(sections.today, false)}</Section>
      )}
      {next.length > 0 && <Section label="Next service">{render(next, false)}</Section>}
      {/* Folded like Finished: the next service is the one in front of
          you, and everything after it is a tap away rather than a scroll. */}
      {upcoming.length > 0 && (
        <FinishedServices
          key={lists.upcomingOpen ? 'upcoming-open' : 'upcoming-shut'}
          count={upcoming.length}
          id={`${finishedId}-upcoming`}
          label="Upcoming services"
          defaultOpen={lists.upcomingOpen}
        >
          {render(upcoming, false)}
        </FinishedServices>
      )}
      {nothingCurrent && empty && <div className="text-body-sm text-on-surface-variant">{empty}</div>}
      {sections.finished.length > 0 && (
        <FinishedServices
          // Re-made when it should start open, which can only be known
          // once the services' times have loaded.
          key={startOpen ? 'finished-open' : 'finished-shut'}
          count={sections.finished.length}
          id={finishedId}
          label="Finished services"
          aside={finishedAside}
          defaultOpen={startOpen}
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

import { useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FinishedServices } from './FinishedServices'
import type { SectionedServices } from '../lib/serviceSections'
import { useAppSettings, useDisplay } from '../lib/appSettings'
import { serviceGoneAt, untilText } from '../lib/expiry'
import { useNow } from '../lib/useNow'
import { SERVICE_PARAM, serviceAnchor } from '../lib/serviceLinks'

/**
 * The four sections, drawn the same way on every page that lists
 * services: Today's services (only on the day), Next service (the nearest
 * service day after today), then Upcoming services and Finished services,
 * both folded until opened — unless the church has said either should
 * start open (Settings › Page by Page).
 *
 * The page says how to draw a run of services (`render`), and which
 * sections it has at all — Debriefs has no Next or Upcoming, since
 * nothing can be written about a service that has not happened. An empty
 * section is left out rather than shown with nothing under it, except
 * that a page with nothing current says so once (`empty`).
 *
 * A page asked for one service by its address (`?service=<id>`, a link
 * from that service's running order) arrives with whichever folded
 * section holds it open, and scrolled to its card where the page has
 * given the card an anchor (lib/serviceLinks). A service the page does
 * not list is said, not left as a page that seems to have ignored the
 * link.
 */
export function ServiceSections<T>({
  sections,
  render,
  has = { next: true, upcoming: true },
  empty,
  finishedId,
  finishedAside,
  finishedOpen = false,
  upcomingOpen = false,
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
  /** Arrive with Upcoming open — for a link pointing inside it. */
  upcomingOpen?: boolean
}) {
  const { lists } = useDisplay()
  const keepDays = useAppSettings().service_retention_days
  const now = useNow(60_000)
  const [params] = useSearchParams()
  const focusId = params.get(SERVICE_PARAM)
  const holds = (list: T[]) => !!focusId && list.some((s) => (s as { id?: unknown }).id === focusId)
  const focusListed = [sections.today, sections.next, sections.upcoming, sections.finished].some(holds)
  const startOpen = finishedOpen || lists.finishedOpen || holds(sections.finished)
  const upcomingStartsOpen = upcomingOpen || lists.upcomingOpen || holds(sections.upcoming)

  // Scroll to the service asked for, once, a beat after the page has
  // drawn: the smaller reads land just after and nudge the card. A page
  // that was also asked for a team inside it (Availability) scrolls there
  // itself.
  const scrolled = useRef(false)
  const alsoATeam = params.has('team')
  useEffect(() => {
    if (scrolled.current || !focusId || !focusListed || alsoATeam) return
    scrolled.current = true
    const timer = window.setTimeout(() => {
      const card = document.getElementById(serviceAnchor(focusId))
      // Guarded: jsdom has no scrollIntoView.
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [focusId, focusListed, alsoATeam])
  // Every finished service is deleted on the church's clock (0128); say
  // when the oldest one here goes, so the countdown is on every page that
  // lists them.
  const oldest = sections.finished
    .map((s) => (s as { date?: unknown }).date)
    .filter((d): d is string => typeof d === 'string')
    .sort()[0]
  const finishedNote = oldest
    ? `Each is deleted ${keepDays} days after its date, with everything about it — the oldest here goes ${untilText(serviceGoneAt(oldest, keepDays), now)}.`
    : undefined
  const next = has.next ? sections.next : []
  const upcoming = has.upcoming ? sections.upcoming : []
  const nothingCurrent = sections.today.length + next.length + upcoming.length === 0

  return (
    <div className="mt-6 flex flex-col gap-8">
      {focusId && !focusListed && (
        <p role="status" className="rounded-[var(--radius-chip)] bg-raised px-4 py-3 text-body-sm text-on-surface-variant hairline">
          The service you came from is not on this page: it is further ahead, or longer ago, than this page lists.
        </p>
      )}
      {sections.today.length > 0 && (
        <Section label="Today’s services">{render(sections.today, false)}</Section>
      )}
      {next.length > 0 && <Section label="Next service">{render(next, false)}</Section>}
      {/* Folded like Finished: the next service is the one in front of
          you, and everything after it is a tap away rather than a scroll. */}
      {upcoming.length > 0 && (
        <FinishedServices
          key={upcomingStartsOpen ? 'upcoming-open' : 'upcoming-shut'}
          count={upcoming.length}
          id={`${finishedId}-upcoming`}
          label="Upcoming services"
          defaultOpen={upcomingStartsOpen}
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
          note={finishedNote}
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

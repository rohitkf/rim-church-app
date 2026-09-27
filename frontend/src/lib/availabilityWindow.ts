/**
 * How far ahead the availability tracker looks, and how it splits what it
 * finds.
 *
 * The tracker used to show a week, which is the right window for the rota
 * — you assign people to the service in front of you — and the wrong one
 * for availability. Availability is asked in advance: a volunteer knows in
 * the second week of the month that they are away on the fourth Sunday,
 * and a page that only shows this week has no way for them to say so. The
 * answer had to wait until the week it was about, which is when it stopped
 * being useful for planning.
 *
 * So it looks three weeks out, and stops the page being a wall by opening
 * only the next service. The rest are there, under their own heading, one
 * touch away.
 */
import { shiftIsoDays, type WindowedService } from './rotaWindow'

/** Three weeks, because that is how far the services are created ahead. */
export const AVAILABILITY_WINDOW_DAYS = 21

/**
 * The window the tracker actually uses.
 *
 * Never less than three weeks, and never narrower than the church's own
 * setting: a church that plans two months out has said so, and the page
 * that asks "can you serve" should not be the one that hides the question.
 */
export function availabilityWindowDays(rotaWindowDays: number): number {
  return Math.max(AVAILABILITY_WINDOW_DAYS, rotaWindowDays)
}

export interface AvailabilityGroups<T> {
  /** The day of the next service still needing an answer, and anything already over before it. */
  now: T[]
  /** That next service itself — the one card that opens on its own. */
  nextId: string | null
  /** Everything after that — real, answerable, and folded away. */
  later: T[]
}

/**
 * Split what is on the page into "the day in front of you" and "the rest".
 *
 * The line is drawn after the day of the next service that can still be
 * answered for. It was once drawn at a day with every card open, which on
 * a phone was two long cards of teams before anybody could see there was
 * a third Sunday; then after one service, which kept one card open but
 * split a Sunday in two — its English service on top and its Malayalam
 * service under Upcoming, the same date heading twice. Now the day stays
 * whole and only its first service opens (`nextId`); the second sits
 * folded beneath it, under the same heading.
 *
 * `services` must already be in the order they happen — by date, and on a
 * day with two, by start time — because "the next one" is whichever comes
 * first, and that is a fact about the running order, not the name.
 *
 * A service that has already finished cannot be answered for, so it never
 * decides where the line falls — but it stays above it, because it came
 * before the one that does.
 */
export function splitAvailabilityGroups<T extends WindowedService>(
  services: T[],
  isFinished: (serviceId: string) => boolean,
): AvailabilityGroups<T> {
  const next = services.findIndex((s) => !isFinished(s.id))
  // Nothing left to answer: it is all a record, and all of it reads as
  // what is in front of you rather than being filed under "upcoming".
  if (next === -1) return { now: [...services], nextId: null, later: [] }

  const day = services[next].date
  const now = services.filter((s, i) => i <= next || s.date === day)
  const later = services.filter((s, i) => i > next && s.date !== day)
  return { now, nextId: services[next].id, later }
}

/**
 * Whether this service is open when the page is first drawn.
 *
 * What still needs an answer, and is next, is open. A finished service is
 * a record, and one three weeks out is not today's problem — both fold,
 * and both open on a touch.
 */
export function opensByDefault(inNowGroup: boolean, finished: boolean): boolean {
  return inNowGroup && !finished
}

/** The horizon the tracker fetches to, as a date. */
export function availabilityHorizon(today: string, rotaWindowDays: number): string {
  return shiftIsoDays(today, availabilityWindowDays(rotaWindowDays))
}

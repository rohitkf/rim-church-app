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
  /** The next service still needing an answer, and anything already over before it. */
  now: T[]
  /** Everything after that — real, answerable, and folded away. */
  later: T[]
}

/**
 * Split what is on the page into "the one in front of you" and "the rest".
 *
 * The line is drawn after one service: the next one that can still be
 * answered for. It used to be drawn at a day, so an English service and a
 * Malayalam service on the same Sunday both opened at the top — which on a
 * phone is two long cards of teams before anybody can see there is a third
 * Sunday to answer for at all. The church asked for the next service alone
 * on top, open, and everything else in the window folded under Upcoming,
 * the second service that morning included.
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
  if (next === -1) return { now: [...services], later: [] }

  return { now: services.slice(0, next + 1), later: services.slice(next + 1) }
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

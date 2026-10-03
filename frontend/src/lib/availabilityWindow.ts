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
import { shiftIsoDays } from './rotaWindow'

/** Three weeks, because that is how far the services are created ahead. */
export const AVAILABILITY_WINDOW_DAYS = 21

/**
 * The window the tracker actually uses.
 *
 * Three weeks unless the church says otherwise (Settings › Dashboard &
 * lists), and never narrower than the church's own
 * setting: a church that plans two months out has said so, and the page
 * that asks "can you serve" should not be the one that hides the question.
 */
export function availabilityWindowDays(
  rotaWindowDays: number,
  askDays: number = AVAILABILITY_WINDOW_DAYS,
): number {
  return Math.max(askDays, rotaWindowDays)
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
export function availabilityHorizon(
  today: string,
  rotaWindowDays: number,
  askDays: number = AVAILABILITY_WINDOW_DAYS,
): string {
  return shiftIsoDays(today, availabilityWindowDays(rotaWindowDays, askDays))
}

import { churchClock } from './clockIn'
import { againstCallWords, type Arrival } from './clockInPunctuality'

const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * One clock-in, said in full: the day, when they clocked in, the call it
 * was for, how it fell against it, and "late" in the word when it was.
 * What the chart's readout shows and what a screen reader hears for a bar
 * (components/ArrivalChart), so the picture never says more than the words.
 */
export function arrivalWords(arrival: Arrival, timeZone: string): string {
  const parts = [longDay(arrival.on_date), `clocked in ${churchClock(arrival.clocked_at, timeZone)}`]
  if (arrival.call_at) parts.push(`call ${churchClock(arrival.call_at, timeZone)}`)
  parts.push(`${againstCallWords(arrival.minutes).toLowerCase()}${arrival.late ? ', late' : ''}`)
  return parts.join(' · ')
}

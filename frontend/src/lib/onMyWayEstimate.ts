import { minutesAway } from './onMyWay'
import { reportLocation } from './locationPermission'
import { askWhereAmI, type WhereAmI } from './whereAmI'

/*
 * One reading of the phone, turned into "about this many minutes" (0337).
 *
 * Taken when somebody presses for it and at no other time. The reading
 * goes where "Am I at church?" already sends one (lib/whereAmI): the
 * database answers with a rounded distance and keeps nothing, and the
 * church's pin stays where it is. What comes back here is a number of
 * minutes; that number is what the person sends on, if they choose to.
 *
 * A rough reading is enough, and quicker: a phone that only knows which
 * side of town it is on still gives the right answer to the nearest five
 * minutes.
 */

export type Estimate =
  /** Near enough to be there: Clock in is the button to press. */
  | { at: 'church' }
  | { at: 'away'; distanceM: number; minutes: number }
  /** The church has not saved where it is. */
  | { at: 'no_place' }
  /** The phone refused: location is blocked for the app. */
  | { at: 'blocked' }
  /** The phone, or the database, could not say. */
  | { at: 'unknown' }

export function estimateFromHere({
  geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  ask = askWhereAmI,
}: {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>
  ask?: (lat: number, lng: number, accuracy: number) => Promise<WhereAmI>
} = {}): Promise<Estimate> {
  if (!geolocation) return Promise.resolve({ at: 'unknown' })
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        reportLocation('granted')
        ask(position.coords.latitude, position.coords.longitude, position.coords.accuracy)
          .then((answer) => {
            if (answer.state === 'no_place') return resolve({ at: 'no_place' })
            if (answer.state === 'in') return resolve({ at: 'church' })
            if (answer.distance_m === undefined) return resolve({ at: 'unknown' })
            resolve({ at: 'away', distanceM: answer.distance_m, minutes: minutesAway(answer.distance_m) })
          })
          .catch(() => resolve({ at: 'unknown' }))
      },
      (err) => {
        const blocked = err.code === err.PERMISSION_DENIED
        if (blocked) reportLocation('denied')
        resolve({ at: blocked ? 'blocked' : 'unknown' })
      },
      // A minute old and rough is fine: this is "about twenty minutes", not a clock-in.
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    )
  })
}

/** What to say under the button once it has been pressed. */
export function estimateWords(estimate: Estimate): string {
  switch (estimate.at) {
    case 'church':
      return 'You are at church already. Press Clock in.'
    case 'away': {
      const far = estimate.distanceM < 1000 ? `${estimate.distanceM} m` : `${(estimate.distanceM / 1000).toFixed(estimate.distanceM < 10_000 ? 1 : 0)} km`
      return `About ${far} away: roughly ${estimate.minutes} minutes. Change it if you know better.`
    }
    case 'no_place':
      return 'The church has not saved where it is yet, so choose a time.'
    case 'blocked':
      return 'Location is blocked for this app, so choose a time.'
    case 'unknown':
      return 'Your phone could not say where it is, so choose a time.'
  }
}

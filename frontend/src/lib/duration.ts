/**
 * A span of minutes, said the way a person says it.
 *
 * "1h 25m" rather than "85 minutes": a running order is read against a
 * clock, and the hour is the part that tells you whether it fits.
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/**
 * The time of day, said the way a person would say it.
 *
 * Its own module so it can be tested at the boundaries — the two moments
 * it changes are the only interesting thing about it, and they are exactly
 * what an inline function never gets checked on.
 */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

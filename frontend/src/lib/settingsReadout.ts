/**
 * A setting's value said the way somebody would say it aloud, for the
 * Timings rows: "12 h" rather than "720 minutes", which is the number the
 * database keeps and nobody thinks in.
 *
 *   shortDuration(45, 'minutes')   → "45 min"
 *   shortDuration(90, 'minutes')   → "1 h 30 min"
 *   shortDuration(2880, 'minutes') → "2 days"
 *   shortDuration(7, 'days')       → "7 days"
 */
export function shortDuration(value: number, unit: 'minutes' | 'days'): string {
  if (unit === 'days') return `${value} ${value === 1 ? 'day' : 'days'}`
  if (value <= 0) return 'None'
  if (value % 1440 === 0) {
    const d = value / 1440
    return `${d} ${d === 1 ? 'day' : 'days'}`
  }
  const h = Math.floor(value / 60)
  const m = value % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

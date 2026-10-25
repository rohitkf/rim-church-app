/** "2026-10-04" → "Sun, 4 Oct 2026", in the reader's own words. */
export function formatDateValue(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "09:05" → "09:05" or "09:05 AM", however the reader's clock is written. */
export function formatTimeValue(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * A time as a person types it, to "HH:MM", or null if it is not one.
 * "9.29", "09:29", "0929", "929", "9 29" and "9" (on the hour) all read;
 * so do "9.29pm" and "12am". Hours run 0–23 without am/pm, 1–12 with it.
 */
export function parseTypedTime(text: string): string | null {
  const match = /^(\d{1,2})(?:[:.,h\s]?(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/.exec(text.trim().toLowerCase())
  if (!match) return null
  const meridiem = match[3]
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0)
  } else if (hour > 23) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function timeInputValue(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function combineDateAndTime(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

/**
 * The same day as `at`, but at the wall-clock time `hhmm`.
 *
 * For correcting a moment that has already passed: somebody presses "session
 * started" ten minutes late and types in when it really began. Only the hour
 * and minute move — the date stays whatever day the service is on, so a
 * correction cannot silently land on yesterday.
 *
 * Returns null for anything that is not a real HH:MM, so a half-typed value
 * in a time input leaves the moment alone rather than jumping to the epoch.
 */
export function withClockTime(at: number, hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const d = new Date(at)
  d.setHours(hours, minutes, 0, 0)
  return d.getTime()
}

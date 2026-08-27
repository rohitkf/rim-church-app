function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The Sunday the dashboard is about: today when today is Sunday,
 * otherwise the Sunday coming up. Everyone lands here; only Admins can
 * move off it to look at past weeks.
 */
export function focusSundayIso(from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return toIso(d)
}

export function isSundayIso(iso: string): boolean {
  return new Date(`${iso}T12:00:00`).getDay() === 0
}

/** Sunday one week either side, for the Admin's week-to-week stepper. */
export function shiftSundayIso(iso: string, weeks: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return toIso(d)
}

export function formatServiceDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

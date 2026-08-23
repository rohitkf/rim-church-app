export function attendancePercent(actual: number | null, expected: number): number | null {
  if (expected <= 0) return null
  return Math.round(((actual ?? 0) / expected) * 100)
}

/** Attendance health thresholds: ≤40% red, 41–80% yellow, above 80% green. */
export function attendanceBarClass(pct: number | null): string {
  if (pct === null) return 'bg-status-pending'
  if (pct <= 40) return 'bg-error'
  if (pct <= 80) return 'bg-warning'
  return 'bg-success'
}

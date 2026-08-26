// Mirrors the pg_cron job in migration 0010: the message board is wiped
// every Tuesday at 00:00 UTC. If that schedule ever changes, change it in
// both places.
export function nextBoardClearTime(from: Date): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const daysUntilTuesday = (2 - next.getUTCDay() + 7) % 7
  next.setUTCDate(next.getUTCDate() + daysUntilTuesday)
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 7)
  return next
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment now'
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

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
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  // Seconds are always shown — the countdown ticks every second, so a
  // display that stops at minutes looks frozen for a minute at a time.
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

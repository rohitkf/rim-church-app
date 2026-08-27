import type { AvailabilityStatus } from './types'

export interface AvailabilitySummary {
  total: number
  available: number
  tentative: number
  unavailable: number
  noAnswer: number
  /** Share of the team that has said yes, 0–100. */
  pct: number
}

/**
 * Rolls a team's answers for one service into the counts behind the mini
 * bar. `memberIds` is the roster the percentage is measured against, so
 * someone who never answers still counts against the team's readiness
 * rather than quietly shrinking the denominator.
 */
export function availabilitySummary(
  memberIds: string[],
  answers: { user_id: string; status: AvailabilityStatus }[],
): AvailabilitySummary {
  const roster = new Set(memberIds)
  const byUser = new Map<string, AvailabilityStatus>()
  for (const a of answers) {
    if (roster.has(a.user_id)) byUser.set(a.user_id, a.status)
  }

  const statuses = [...byUser.values()]
  const available = statuses.filter((s) => s === 'available').length
  const tentative = statuses.filter((s) => s === 'tentative').length
  const unavailable = statuses.filter((s) => s === 'unavailable').length
  const total = roster.size

  return {
    total,
    available,
    tentative,
    unavailable,
    noAnswer: total - byUser.size,
    pct: total > 0 ? Math.round((available / total) * 100) : 0,
  }
}

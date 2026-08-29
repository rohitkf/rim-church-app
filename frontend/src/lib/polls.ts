/**
 * The arithmetic behind a poll, kept away from the component so the rules
 * can be tested without rendering anything.
 */

export type ChoiceMode = 'single' | 'multiple'

export interface PollVote {
  option_id: string
  user_id: string
}

/** How many people picked each option, and which ones this person picked. */
export function tallyVotes(
  optionIds: string[],
  votes: PollVote[],
  myId: string | null | undefined,
): { counts: Record<string, number>; mine: Set<string>; voters: number } {
  const counts: Record<string, number> = {}
  for (const id of optionIds) counts[id] = 0
  const mine = new Set<string>()
  const people = new Set<string>()

  for (const v of votes) {
    if (v.option_id in counts) counts[v.option_id] += 1
    // A multiple-choice poll has one person on several options, so the
    // number who answered is the number of distinct people, not of votes.
    people.add(v.user_id)
    if (myId && v.user_id === myId) mine.add(v.option_id)
  }

  return { counts, mine, voters: people.size }
}

/**
 * The share of the bar an option fills.
 *
 * Measured against the leading option rather than the number of people, so
 * a multiple-choice poll — where the counts can add up to more than the
 * turnout — still draws bars that compare with each other.
 */
export function optionShare(count: number, counts: Record<string, number>): number {
  const top = Math.max(0, ...Object.values(counts))
  return top === 0 ? 0 : Math.round((count / top) * 100)
}

/** Whether the poll still takes answers — the same rule as poll_is_open(). */
export function pollIsOpen(closesAt: string | null, now: number): boolean {
  if (!closesAt) return true
  return new Date(closesAt).getTime() > now
}

/**
 * How long is left, in the largest unit that still says something useful.
 * A deadline four days out does not need seconds ticking.
 */
export function timeLeft(closesAt: string, now: number): string {
  const ms = new Date(closesAt).getTime() - now
  if (ms <= 0) return 'closed'
  const secs = Math.floor(ms / 1000)
  const days = Math.floor(secs / 86400)
  const hrs = Math.floor((secs % 86400) / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (days > 0) return `${days}d ${hrs}h left`
  if (hrs > 0) return `${hrs}h ${mins}m left`
  if (mins > 0) return `${mins}m ${String(s).padStart(2, '0')}s left`
  return `${s}s left`
}

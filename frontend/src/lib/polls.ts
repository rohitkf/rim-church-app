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

export interface PollTallyRow {
  poll_id: string
  option_id: string
  votes: number
  voters: number
}

/**
 * The counts the database gives (0172): on an anonymous poll the answer
 * rows that reach the browser are the person's own, so the numbers come
 * from poll_tallies() and the ticks from the rows.
 */
export function tallyFromRows(
  optionIds: string[],
  rows: PollTallyRow[],
  votes: PollVote[],
  myId: string | null | undefined,
): { counts: Record<string, number>; mine: Set<string>; voters: number } {
  const counts: Record<string, number> = {}
  for (const id of optionIds) counts[id] = 0
  let voters = 0
  for (const r of rows) {
    if (r.option_id in counts) counts[r.option_id] = r.votes
    voters = Math.max(voters, r.voters)
  }
  const mine = new Set<string>()
  for (const v of votes) if (myId && v.user_id === myId) mine.add(v.option_id)
  return { counts, mine, voters }
}

/** One person who answered a poll, as the list under the poll shows them. */
export interface PollRespondent {
  id: string
  name: string
  /** The teams this viewer can see them on; " (guest)" marks a guest place. */
  teams: string[]
}

interface RespondentVote {
  user_id: string
  voter: {
    first_name: string
    last_name: string
    teams?: { member_type: string; department: { name: string } | null }[]
  } | null
}

/**
 * Everybody whose answer row this viewer was sent, once each, by name.
 * A person who picked several options of a "pick any" poll is one person.
 * Team names come from the rows the database lets the viewer read, so a
 * missing team means "not visible to you", not "on no team".
 */
export function respondentsFrom(votes: RespondentVote[]): PollRespondent[] {
  const byId = new Map<string, PollRespondent>()
  for (const v of votes) {
    if (!v.voter || byId.has(v.user_id)) continue
    const teams = [
      ...new Set(
        (v.voter.teams ?? [])
          .filter((t) => t.department)
          .map((t) => `${t.department!.name}${t.member_type === 'guest' ? ' (guest)' : ''}`),
      ),
    ].sort((a, b) => a.localeCompare(b))
    byId.set(v.user_id, {
      id: v.user_id,
      name: `${v.voter.first_name} ${v.voter.last_name}`.trim(),
      teams,
    })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The options to lift to the top and mark (0181): the `n` most picked, and
 * any tied with the last of them. Nothing when the setting is off, when
 * the poll has no more options than `n` (they would all be "top"), or for
 * an option nobody has picked.
 */
export function topOptions(counts: Record<string, number>, n: number): Set<string> {
  const ids = Object.keys(counts)
  if (n <= 0 || ids.length <= n) return new Set()
  const sorted = ids.map((id) => counts[id]).sort((a, b) => b - a)
  // Fewer than n options picked at all: every picked one is in the top n.
  const cut = Math.max(sorted[n - 1], 1)
  return new Set(ids.filter((id) => counts[id] >= cut))
}

/** The options with the top ones first, most picked first; the rest keep their order. */
export function withTopFirst<T extends { id: string }>(options: T[], top: Set<string>, counts: Record<string, number>): T[] {
  if (top.size === 0) return options
  const lifted = options.filter((o) => top.has(o.id)).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
  return [...lifted, ...options.filter((o) => !top.has(o.id))]
}

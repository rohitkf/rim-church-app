/**
 * Turning a row of the activity table into a sentence.
 *
 * The database records what happened in the plainest terms it can — a kind,
 * a subject, a detail — and the wording lives here, where it can be read and
 * changed without a migration. Every sentence is a predicate: the feed puts
 * the person's name in front of it, so they all have to start with a verb.
 */

export interface ActivityRowLike {
  kind: string
  subject: string | null
  detail: string | null
}

const AVAILABILITY_WORDS: Record<string, string> = {
  available: 'can serve',
  tentative: 'might be able to serve',
  unavailable: "can't serve",
}

export function activitySentence(row: ActivityRowLike): string {
  const subject = row.subject ?? 'something'
  const detail = row.detail ?? ''

  switch (row.kind) {
    case 'availability':
      return `${AVAILABILITY_WORDS[detail] ?? `marked ${detail}`} — ${subject}`
    case 'attendance':
      return `${detail} — ${subject}`
    case 'planner':
      return `${detail} ${subject} in the running order`
    case 'checklist':
      return `${detail} ${subject}`
    case 'rota': {
      // The database wrote "Dave assigned" / "Dave taken off": the person is
      // the fact, and who did the assigning is the actor in front.
      const assigned = detail.match(/^(.*) assigned$/)
      if (assigned) return `put ${assigned[1]} on ${subject}`
      const removed = detail.match(/^(.*) taken off$/)
      if (removed) return `took ${removed[1]} off ${subject}`
      return `changed ${subject}`
    }
    case 'message':
      return subject === 'the board' ? 'posted on the board' : `posted as ${subject}`
    default:
      return detail ? `${detail} ${subject}` : subject
  }
}

/** The accent each kind wears in the feed. */
export function activityTone(kind: string): string {
  switch (kind) {
    case 'availability':
      return 'bg-accent-green'
    case 'attendance':
      return 'bg-accent-blue'
    case 'checklist':
      return 'bg-accent-indigo'
    case 'rota':
      return 'bg-accent-orange'
    case 'planner':
      return 'bg-accent-teal'
    default:
      return 'bg-on-surface-faint'
  }
}

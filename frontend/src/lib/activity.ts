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

/**
 * The same answers, given by somebody else on your behalf.
 *
 * An Admin taking an answer over the phone is a different event from you
 * changing your mind, and the feed exists so that the difference is
 * visible: "can serve" is about the actor, "marked Grace available" is
 * about what the actor did to somebody else's answer.
 */
const AVAILABILITY_FOR_WORDS: Record<string, string> = {
  available: 'available',
  tentative: 'a maybe',
  unavailable: 'unavailable',
}

const ATTENDANCE_WORDS: Record<string, string> = {
  'turned up': 'turned up',
  'did not turn up': 'did not turn up',
  'attendance cleared': 'cleared their attendance mark',
}

/**
 * A checklist item moving a stage, in both directions.
 *
 * Undoing something is exactly the event a feed exists to show, so it gets
 * its own words rather than the name of the stage the item fell back to —
 * "took the sign-off off" is the news; "is now head verified" is not.
 */
const CHECKLIST_WORDS: Record<string, string> = {
  ticked: 'ticked off',
  verified: 'verified',
  signed_off: 'signed off',
  unticked: 'un-ticked',
  unverified: 'took their verification off',
  unsigned: 'took the sign-off off',
}

/**
 * Whose answer a line is about.
 *
 * The trigger writes "available for Grace Mensah" when the actor and the
 * person differ, and the bare word when they don't.
 */
function splitOwner(detail: string): { said: string; who: string | null } {
  const named = detail.match(/^(.*?) for (.+)$/)
  return named ? { said: named[1], who: named[2] } : { said: detail, who: null }
}

export function activitySentence(row: ActivityRowLike): string {
  const subject = row.subject ?? 'something'
  const detail = row.detail ?? ''

  switch (row.kind) {
    case 'availability': {
      const { said, who } = splitOwner(detail)
      if (!who) {
        // Taking an answer back used to leave no trace at all.
        if (said === 'removed') return `took their answer back — ${subject}`
        if (said === 'note added') return `added a note — ${subject}`
        if (said === 'note changed') return `changed their note — ${subject}`
        if (said === 'note removed') return `took their note off — ${subject}`
        return `${AVAILABILITY_WORDS[said] ?? `marked ${said}`} — ${subject}`
      }
      if (said === 'removed') return `took ${who}'s answer off — ${subject}`
      if (said === 'note added') return `added a note for ${who} — ${subject}`
      if (said === 'note changed') return `changed ${who}'s note — ${subject}`
      if (said === 'note removed') return `took ${who}'s note off — ${subject}`
      return `marked ${who} ${AVAILABILITY_FOR_WORDS[said] ?? said} — ${subject}`
    }
    case 'attendance': {
      const { said, who } = splitOwner(detail)
      if (!who) return `${ATTENDANCE_WORDS[said] ?? said} — ${subject}`
      if (said === 'attendance cleared') return `cleared ${who}'s attendance mark — ${subject}`
      return `marked ${who} as ${said} — ${subject}`
    }
    case 'service': {
      // The largest changes anybody makes to a Sunday, and the ones people
      // most need to see: the date moving takes everything else with it.
      if (detail === 'added') return `added ${subject}`
      const moved = detail.match(/^moved to (.+)$/)
      if (moved) return `moved ${subject} to ${moved[1]}`
      const renamed = detail.match(/^renamed from (.+)$/)
      if (renamed) return `renamed ${renamed[1]} to ${subject}`
      if (detail === 'called the end') return `called the end of ${subject}`
      if (detail === 'reopened') return `reopened ${subject}`
      return detail ? `${detail} ${subject}` : subject
    }
    case 'call_time': {
      const called = detail.match(/^called in at (.+)$/)
      if (called) return `called ${subject} in at ${called[1]}`
      const movedTo = detail.match(/^call time moved to (.+)$/)
      if (movedTo) return `moved ${subject}'s call time to ${movedTo[1]}`
      if (detail === 'call time removed') return `took ${subject}'s call time off`
      return `${detail} ${subject}`
    }
    // The request already reads as a predicate; it only wants its team.
    case 'availability_request':
      return `${detail} — ${subject}`
    case 'debrief': {
      if (detail === 'wrote up the debrief') return `wrote up ${subject}'s debrief`
      if (detail === 'updated the debrief') return `updated ${subject}'s debrief`
      if (detail === 'removed the debrief') return `took ${subject}'s debrief down`
      return `${detail} — ${subject}`
    }
    case 'set_list': {
      if (detail === 'added to the set list') return `added ${subject} to the set list`
      if (detail === 'changed on the set list') return `changed ${subject} on the set list`
      if (detail === 'taken off the set list') return `took ${subject} off the set list`
      return `${detail} ${subject}`
    }
    case 'planner': {
      // A name going on or off a session: the name is the news, and the
      // actor — who may well be somebody else — is in front of it already.
      const on = detail.match(/^(.*) put on$/)
      if (on) return `put ${on[1]} on ${subject}`
      const off = detail.match(/^(.*) taken off$/)
      if (off) return `took ${off[1]} off ${subject}`
      return `${detail} ${subject} in the running order`
    }
    case 'checklist': {
      // The checklist itself, rather than an item on it: the subject is the
      // team, so these two read as sentences on their own.
      if (detail === 'started the checklist') return `started ${subject}'s checklist`
      if (detail === 'took the checklist down') return `took ${subject}'s checklist down`
      return `${CHECKLIST_WORDS[detail] ?? detail} ${subject}`
    }
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

/**
 * The accent each kind wears in the feed.
 *
 * There are more kinds than there are accents, so kinds that are about the
 * same thing share one: a late request is an availability answer, minutes
 * are a checklist of sorts, and a call time is the rota by another name.
 */
export function activityTone(kind: string): string {
  switch (kind) {
    case 'availability':
    case 'availability_request':
      return 'bg-accent-green'
    case 'attendance':
      return 'bg-accent-blue'
    case 'checklist':
    case 'debrief':
      return 'bg-accent-indigo'
    case 'rota':
    case 'call_time':
      return 'bg-accent-orange'
    case 'planner':
    case 'set_list':
      return 'bg-accent-teal'
    case 'service':
      return 'bg-accent-red'
    default:
      return 'bg-on-surface-faint'
  }
}

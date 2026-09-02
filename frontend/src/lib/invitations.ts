import type { Invitation } from './types'

/**
 * Reading an invitation's history.
 *
 * Three things are worth knowing about an invitation that went out, and
 * only one of them is stored: whether it was answered. The other two —
 * whether it is still worth waiting on, and whether it has been sitting
 * long enough that somebody should be asked in person — are read off the
 * dates here rather than in the component, so they can be tested without
 * a browser.
 */

export type InvitationStatus = 'accepted' | 'waiting' | 'stale'

/**
 * How long an unanswered invitation stays merely "waiting".
 *
 * Two weeks is not a rule about email; it is roughly the point at which
 * "they haven't got round to it" stops being the likeliest explanation
 * and "it went to spam, or to the wrong address" starts. The list says so
 * rather than leaving every outstanding invitation looking equally fresh.
 */
export const STALE_AFTER_DAYS = 14

export function invitationStatus(invitation: Invitation, now: number = Date.now()): InvitationStatus {
  if (invitation.accepted_at) return 'accepted'
  const ageMs = now - new Date(invitation.created_at).getTime()
  return ageMs >= STALE_AFTER_DAYS * 86_400_000 ? 'stale' : 'waiting'
}

export type InvitationFilter = 'all' | 'outstanding' | 'accepted'

/** Whether a row belongs in the view currently chosen. */
export function matchesFilter(invitation: Invitation, filter: InvitationFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'accepted') return !!invitation.accepted_at
  return !invitation.accepted_at
}

/**
 * The list as it is shown: newest first, and answered invitations below
 * unanswered ones.
 *
 * The question this page is opened with is almost always "who has not
 * come in yet", so those rows go to the top. Within either group the
 * newest is the interesting one — the invitation somebody sent this
 * morning and is wondering about.
 */
export function orderInvitations(invitations: Invitation[]): Invitation[] {
  return [...invitations].sort((a, b) => {
    const answered = Number(!!a.accepted_at) - Number(!!b.accepted_at)
    if (answered !== 0) return answered
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** The counts the panel's header reports, in one pass. */
export function invitationTally(invitations: Invitation[], now: number = Date.now()) {
  let accepted = 0
  let outstanding = 0
  let stale = 0
  for (const invitation of invitations) {
    const status = invitationStatus(invitation, now)
    if (status === 'accepted') accepted += 1
    else {
      outstanding += 1
      if (status === 'stale') stale += 1
    }
  }
  return { total: invitations.length, accepted, outstanding, stale }
}

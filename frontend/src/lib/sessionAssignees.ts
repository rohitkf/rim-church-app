import { supabase } from './supabaseClient'
import { guestLabel } from './guests'
import { initialsOf } from './initials'
import type { SessionAssignee } from './types'

/**
 * Who is taking a running-order session — and how a change to that list
 * is written.
 *
 * A session used to carry its one lead in its own two columns, so setting
 * it was part of the same update as renaming it. Now the people are rows
 * of their own, and saying "these four" means working out which of them
 * are new, which have gone, and where each sits in the order. That
 * arithmetic is here rather than in the page, because it is the kind of
 * thing that is written once and read at every glance afterwards.
 */

/** A person, wherever one is picked: an account or a name on the guest roll. */
export interface PersonRef {
  kind: 'member' | 'guest'
  id: string
}

/** How an assignee row is addressed — the pair that identifies the person. */
export function refOf(assignee: SessionAssignee): PersonRef {
  return assignee.user_id
    ? { kind: 'member', id: assignee.user_id }
    : { kind: 'guest', id: assignee.guest_id ?? '' }
}

const keyOf = (ref: PersonRef) => `${ref.kind}:${ref.id}`

/**
 * The name to print for an assignee.
 *
 * A guest's designation is part of how a church says their name — "Pastor
 * Godlee" is not "Godlee" with a label attached — so `guestLabel` puts it
 * in front. A row whose person has been deleted out from under it has no
 * name to give; the caller drops it rather than printing a blank.
 */
export function assigneeName(assignee: SessionAssignee): string | null {
  if (assignee.guest) return guestLabel(assignee.guest)
  if (assignee.profile) return `${assignee.profile.first_name} ${assignee.profile.last_name}`
  return null
}

/**
 * The two letters for their disc.
 *
 * A member has a first and last name to take them from. A guest has one
 * field holding however they are known, so the initials come from the
 * words of it — and from the name rather than the designation, or every
 * visiting minister would be a "P".
 */
export function assigneeInitials(assignee: SessionAssignee): string {
  if (assignee.profile) return initialsOf(assignee.profile.first_name, assignee.profile.last_name)
  const words = (assignee.guest?.name ?? '').trim().split(/\s+/).filter(Boolean)
  return initialsOf(words[0], words[1])
}

/** Everyone on a session, in the order somebody put them there. */
export function peopleOn(session: { assignees?: SessionAssignee[] }): SessionAssignee[] {
  return [...(session.assignees ?? [])].sort((a, b) => a.order_index - b.order_index)
}

/** The same list as names, ready to print. */
export function namesOn(session: { assignees?: SessionAssignee[] }): string[] {
  return peopleOn(session)
    .map(assigneeName)
    .filter((name): name is string => !!name)
}

/**
 * Make the session's list of people match `next`.
 *
 * Only the difference is written. Re-inserting the lot on every change
 * would work and would be simpler to read, but every row on this table is
 * an entry in the activity feed and a realtime message to every other
 * screen — so adding one person to a worship team of five would tell the
 * church that six things happened.
 */
export async function saveAssignees(
  sessionId: string,
  current: SessionAssignee[],
  next: PersonRef[],
): Promise<void> {
  const wanted = new Map(next.map((ref, index) => [keyOf(ref), { ref, index }]))
  const held = new Map(current.map((row) => [keyOf(refOf(row)), row]))

  const gone = current.filter((row) => !wanted.has(keyOf(refOf(row))))
  if (gone.length > 0) {
    const { error } = await supabase
      .from('service_session_assignees')
      .delete()
      .in(
        'id',
        gone.map((row) => row.id),
      )
    if (error) throw error
  }

  const added = next
    .map((ref, index) => ({ ref, index }))
    .filter(({ ref }) => !held.has(keyOf(ref)))
  if (added.length > 0) {
    const { error } = await supabase.from('service_session_assignees').insert(
      added.map(({ ref, index }) => ({
        session_id: sessionId,
        user_id: ref.kind === 'member' ? ref.id : null,
        guest_id: ref.kind === 'guest' ? ref.id : null,
        order_index: index,
      })),
    )
    if (error) throw error
  }

  // Anybody who stayed but has moved up or down the list because somebody
  // else left it.
  for (const row of current) {
    const place = wanted.get(keyOf(refOf(row)))
    if (!place || place.index === row.order_index) continue
    const { error } = await supabase
      .from('service_session_assignees')
      .update({ order_index: place.index })
      .eq('id', row.id)
    if (error) throw error
  }
}

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

/**
 * What somebody is on a session: taking it, standing by to take it
 * (0182), or translating it as it is taken (0315). One of the three and
 * never two: the database keeps a person on a session once.
 */
export type SessionPart = 'lead' | 'substitute' | 'translator'

/** Which of the three a row is. */
export function partOf(assignee: SessionAssignee): SessionPart {
  return assignee.is_translator ? 'translator' : assignee.is_substitute ? 'substitute' : 'lead'
}

/** One of a session's three lists, each in its own order. */
function listOn(session: { assignees?: SessionAssignee[] }, part: SessionPart): SessionAssignee[] {
  return [...(session.assignees ?? [])].filter((a) => partOf(a) === part).sort((a, b) => a.order_index - b.order_index)
}

/**
 * Everyone taking a session, in the order somebody put them there.
 *
 * Not the substitutes (0182): they are named to step in, not on it, so a
 * session with only a substitute is still a session nobody is taking. Nor
 * the translators (0315), who say it again and do not take it.
 */
export function peopleOn(session: { assignees?: SessionAssignee[] }): SessionAssignee[] {
  return listOn(session, 'lead')
}

/** Whoever steps in if they cannot, in their own order. */
export function substitutesOn(session: { assignees?: SessionAssignee[] }): SessionAssignee[] {
  return listOn(session, 'substitute')
}

/** Whoever translates it as it is taken, in their own order. */
export function translatorsOn(session: { assignees?: SessionAssignee[] }): SessionAssignee[] {
  return listOn(session, 'translator')
}

const named = (people: SessionAssignee[]) =>
  people.map(assigneeName).filter((name): name is string => !!name)

/**
 * People as the exported sheet takes them: the name, and for a guest what
 * is kept about them ("pastor from Harlow"), which the sheet says under
 * the name as the planner does. A member has no note.
 */
export function sheetPeople(people: SessionAssignee[]): { name: string; note: string | null }[] {
  return people.flatMap((person) => {
    const name = assigneeName(person)
    return name ? [{ name, note: person.guest?.note?.trim() || null }] : []
  })
}

/** The people taking it, as names ready to print. */
export function namesOn(session: { assignees?: SessionAssignee[] }): string[] {
  return named(peopleOn(session))
}

/** The substitutes, as names ready to print. */
export function substituteNamesOn(session: { assignees?: SessionAssignee[] }): string[] {
  return named(substitutesOn(session))
}

/** The translators, as names ready to print. */
export function translatorNamesOn(session: { assignees?: SessionAssignee[] }): string[] {
  return named(translatorsOn(session))
}

/**
 * The session as it will be once `next` is saved, when `next` is only a
 * new order for the people already on that list. Anything else — somebody
 * added, somebody gone — is `null`: those rows are the database's to make.
 *
 * So that a new order is on the page the moment it is dropped, and so the
 * next change is worked out from this order and not the one before it.
 * `saveAssignees` writes only what differs from the rows it is handed, and
 * handed stale ones it would skip a move that puts somebody back where
 * they used to be.
 */
export function withNewOrder<S extends { assignees?: SessionAssignee[] }>(
  session: S,
  next: PersonRef[],
  part: SessionPart = 'lead',
): S | null {
  const list = listOn(session, part)
  const place = new Map(next.map((ref, index) => [keyOf(ref), index]))
  if (list.length !== place.size || !list.every((row) => place.has(keyOf(refOf(row))))) return null
  return {
    ...session,
    assignees: (session.assignees ?? []).map((row) =>
      partOf(row) === part ? { ...row, order_index: place.get(keyOf(refOf(row))) ?? row.order_index } : row,
    ),
  }
}

/**
 * Make one of the session's three lists — who is taking it, who stands
 * in or who translates (`part`) — match `next`. `current` is that list's
 * rows only.
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
  part: SessionPart = 'lead',
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
        is_substitute: part === 'substitute',
        // Said only of a translator: every other row is one by the column's
        // own default, and a row that never names the column is a row an
        // app a release behind can still read back.
        ...(part === 'translator' ? { is_translator: true } : {}),
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

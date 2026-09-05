import type { UserRole } from '../auth/types'

export type Designation = 'head' | 'assisting' | 'member'

/** What a person is on one team, in descending authority. */
export function designationOn(grants: UserRole[], departmentId: string): Designation {
  if (grants.some((g) => g.role_type === 'department_head' && g.department_id === departmentId)) {
    return 'head'
  }
  if (grants.some((g) => g.role_type === 'assisting_head' && g.department_id === departmentId)) {
    return 'assisting'
  }
  return 'member'
}

export const DESIGNATION_LABEL: Record<Designation, string> = {
  head: 'Department Head',
  assisting: 'Assisting Head',
  member: 'Team Member',
}

/** The short form, for a badge that sits beside a name. */
export const DESIGNATION_BADGE: Record<Designation, string> = {
  head: 'Head',
  assisting: 'Assisting',
  member: '',
}

/** Heads first, then their deputies, then everyone else. */
export const DESIGNATION_RANK: Record<Designation, number> = {
  head: 0,
  assisting: 1,
  member: 2,
}

/** As much of a roster row as ordering one needs. */
export interface RosterPerson {
  user_id: string
  profiles?: { first_name: string; last_name: string } | null
}

/** Surname after forename, so two Rohits do not tie. */
function nameOf(person: RosterPerson): string {
  return `${person.profiles?.first_name ?? ''} ${person.profiles?.last_name ?? ''}`.trim()
}

/**
 * The order a team reads in: whoever runs it, then whoever stands in for
 * them, then everybody else A to Z.
 *
 * The person to ask about a rota clash and the person to ask about a
 * camera looked exactly alike in an alphabetical list, and a new member
 * had no way to tell which was which. Note that this depends on the
 * grants being *visible*: they were readable only by an Admin until 0083,
 * which is why this ordering existed for months and almost nobody saw it.
 */
export function orderByDesignation<T extends RosterPerson>(
  members: T[],
  designationOf: (userId: string) => Designation,
): T[] {
  return [...members].sort(
    (a, b) =>
      DESIGNATION_RANK[designationOf(a.user_id)] - DESIGNATION_RANK[designationOf(b.user_id)] ||
      nameOf(a).localeCompare(nameOf(b)),
  )
}

/** Everyone else, alphabetically — a guest has no rank to sort by. */
export function orderByName<T extends RosterPerson>(members: T[]): T[] {
  return [...members].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
}

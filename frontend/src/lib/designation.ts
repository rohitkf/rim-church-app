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

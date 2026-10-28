/**
 * What each standing is called, wherever the app says it.
 *
 * The grid said "Team Head" while Volunteers, the Dashboard and the
 * account menu said "Department Head", and the grid's "Coordinator" was
 * the rota's "Team Coordinator" — one person, two names, depending on the
 * page. Every label reads these instead. The database keeps its own words
 * (`department_head`, `assisting_head`); only what people read is here.
 */
export const ROLE_NAME = {
  owner: 'Owner',
  admin: 'Admin',
  overwatch: 'Overwatch',
  pastor: 'Pastor',
  head: 'Team Head',
  assistant: 'Assisting Head',
  coordinator: 'Team Coordinator',
  member: 'Team Member',
  newcomer: 'Church Member',
  serviceFlow: 'Service Flow Coordinator',
} as const

/** The short forms, for a column header or a badge beside a name. */
export const ROLE_SHORT = {
  admin: 'Admin',
  head: 'Head',
  assistant: 'Asst Head',
  coordinator: 'Coordinator',
  member: 'Member',
  newcomer: 'Church Member',
} as const

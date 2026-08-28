/**
 * The volunteer roll, as a workbook.
 *
 * Building the sheets is kept entirely separate from writing the file:
 * what belongs in a column, who counts as a member of what, and how a
 * blank is spelled are decisions worth testing, and none of them need a
 * spreadsheet library to be checked. `writeWorkbook` takes what this
 * returns and turns it into bytes.
 *
 * Four sheets, because there are four questions people actually ask of
 * this data: who are they (one row per person), who is on what (one row
 * per membership, the shape you sort and filter), how big is each team,
 * and — for whoever keeps the church's compliance record — who is cleared
 * to serve.
 */
import type { MemberType, DepartmentMemberRow, SensitiveByUser } from './types'
import type { UserRole } from '../auth/types'

export interface ExportPerson {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  dob?: string | null
  anniversary?: string | null
}

export interface ExportTeam {
  id: string
  name: string
}

export interface ExportColumn {
  label: string
  /** Roughly in characters, for the column's width in the sheet. */
  width: number
}

export type ExportCell = string | number | boolean | null

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: ExportCell[][]
}

export interface ExportInput {
  people: ExportPerson[]
  teams: ExportTeam[]
  memberships: DepartmentMemberRow[]
  grants: (UserRole & { user_id: string })[]
  /** Keyed by user id; only present when compliance is being included. */
  sensitive?: Map<string, SensitiveByUser>
  /** Which teams to report on. */
  selectedTeamIds: string[]
  /** Admin user ids, so the sheet can say who can change things. */
  adminIds: Set<string>
  ownerId?: string | null
  /** Include people who are on none of the selected teams. */
  includeUnassigned?: boolean
}

/** A blank cell reads better than the word "null" in a spreadsheet. */
const blank = (value: string | null | undefined): string => value ?? ''

const MEMBER_TYPE_LABEL: Record<MemberType, string> = { core: 'Core', guest: 'Guest' }

/** Designation within one team, in descending authority. */
export function designationIn(
  grants: { role_type: string; department_id: string | null }[],
  teamId: string,
): string {
  if (grants.some((g) => g.role_type === 'department_head' && g.department_id === teamId)) {
    return 'Department Head'
  }
  if (grants.some((g) => g.role_type === 'assisting_head' && g.department_id === teamId)) {
    return 'Assisting Head'
  }
  return 'Team Member'
}

const byName = (a: { last_name: string; first_name: string }, b: typeof a) =>
  a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)

export function buildVolunteerWorkbook(input: ExportInput): ExportSheet[] {
  const selected = new Set(input.selectedTeamIds)
  const teams = input.teams.filter((t) => selected.has(t.id))
  const teamName = new Map(input.teams.map((t) => [t.id, t.name]))

  const memberships = input.memberships.filter((m) => selected.has(m.department_id))
  const grantsBy = new Map<string, (UserRole & { user_id: string })[]>()
  for (const grant of input.grants) {
    grantsBy.set(grant.user_id, [...(grantsBy.get(grant.user_id) ?? []), grant])
  }

  // Teams per person, split by how they belong, so "core" and "guest"
  // stay distinguishable in one row.
  const teamsFor = (userId: string, type: MemberType) =>
    memberships
      .filter((m) => m.user_id === userId && m.member_type === type)
      .map((m) => teamName.get(m.department_id) ?? '')
      .filter(Boolean)
      .sort()

  const onSelectedTeam = new Set(memberships.map((m) => m.user_id))
  const people = input.people
    .filter((p) => input.includeUnassigned || onSelectedTeam.has(p.id))
    .sort(byName)

  const roleWords = (userId: string) => {
    const words: string[] = []
    if (input.ownerId === userId) words.push('Owner')
    if (input.adminIds.has(userId)) words.push('Admin')
    for (const grant of grantsBy.get(userId) ?? []) {
      const where = grant.department_id ? ` (${teamName.get(grant.department_id) ?? '—'})` : ''
      if (grant.role_type === 'department_head') words.push(`Department Head${where}`)
      if (grant.role_type === 'assisting_head') words.push(`Assisting Head${where}`)
      if (grant.role_type === 'service_flow_coordinator') words.push('Service Flow Coordinator')
    }
    return [...new Set(words)].join(', ')
  }

  const volunteers: ExportSheet = {
    name: 'Volunteers',
    columns: [
      { label: 'First name', width: 18 },
      { label: 'Last name', width: 18 },
      { label: 'Email', width: 30 },
      { label: 'Phone', width: 16 },
      { label: 'Date of birth', width: 14 },
      { label: 'Wedding anniversary', width: 18 },
      { label: 'Core teams', width: 30 },
      { label: 'Guest teams', width: 24 },
      { label: 'Roles', width: 34 },
    ],
    rows: people.map((p) => [
      p.first_name,
      p.last_name,
      p.email,
      blank(p.phone),
      blank(p.dob),
      blank(p.anniversary),
      teamsFor(p.id, 'core').join(', '),
      teamsFor(p.id, 'guest').join(', '),
      roleWords(p.id),
    ]),
  }

  // One row per membership — the shape a spreadsheet is actually good at:
  // sort by team, filter by designation, count what you like.
  const personById = new Map(input.people.map((p) => [p.id, p]))
  const membershipRows = memberships
    .map((m) => ({ membership: m, person: personById.get(m.user_id) }))
    .filter((row): row is { membership: DepartmentMemberRow; person: ExportPerson } => !!row.person)
    .sort(
      (a, b) =>
        (teamName.get(a.membership.department_id) ?? '').localeCompare(
          teamName.get(b.membership.department_id) ?? '',
        ) || byName(a.person, b.person),
    )

  const teamMembers: ExportSheet = {
    name: 'Team members',
    columns: [
      { label: 'Team', width: 24 },
      { label: 'Member type', width: 12 },
      { label: 'Designation', width: 18 },
      { label: 'First name', width: 18 },
      { label: 'Last name', width: 18 },
      { label: 'Email', width: 30 },
      { label: 'Phone', width: 16 },
    ],
    rows: membershipRows.map(({ membership, person }) => [
      teamName.get(membership.department_id) ?? '',
      MEMBER_TYPE_LABEL[membership.member_type],
      designationIn(grantsBy.get(person.id) ?? [], membership.department_id),
      person.first_name,
      person.last_name,
      person.email,
      blank(person.phone),
    ]),
  }

  const nameOf = (userId: string) => {
    const person = personById.get(userId)
    return person ? `${person.first_name} ${person.last_name}` : ''
  }

  const teamsSheet: ExportSheet = {
    name: 'Teams',
    columns: [
      { label: 'Team', width: 24 },
      { label: 'Core members', width: 14 },
      { label: 'Guest members', width: 14 },
      { label: 'Department heads', width: 30 },
      { label: 'Assisting heads', width: 30 },
    ],
    rows: teams
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((team) => {
        const mine = memberships.filter((m) => m.department_id === team.id)
        const heads = input.grants
          .filter((g) => g.department_id === team.id && g.role_type === 'department_head')
          .map((g) => nameOf(g.user_id))
          .filter(Boolean)
        const assisting = input.grants
          .filter((g) => g.department_id === team.id && g.role_type === 'assisting_head')
          .map((g) => nameOf(g.user_id))
          .filter(Boolean)
        return [
          team.name,
          mine.filter((m) => m.member_type === 'core').length,
          mine.filter((m) => m.member_type === 'guest').length,
          heads.sort().join(', '),
          assisting.sort().join(', '),
        ]
      }),
  }

  const sheets = [volunteers, teamMembers, teamsSheet]

  if (input.sensitive) {
    const sensitive = input.sensitive
    sheets.push({
      name: 'Compliance',
      columns: [
        { label: 'First name', width: 18 },
        { label: 'Last name', width: 18 },
        { label: 'Email', width: 30 },
        { label: 'Visa type', width: 20 },
        { label: 'Visa expiry', width: 14 },
        { label: 'DBS check', width: 12 },
      ],
      rows: people.map((p) => {
        const record = sensitive.get(p.id)
        return [
          p.first_name,
          p.last_name,
          p.email,
          blank(record?.visa_type),
          blank(record?.visa_expiry),
          record ? (record.has_dbs ? 'Yes' : 'No') : '',
        ]
      }),
    })
  }

  return sheets
}

/** Dated, so two exports a week apart don't overwrite each other. */
export function exportFileName(now: Date = new Date()): string {
  return `rim-volunteers-${now.toISOString().slice(0, 10)}.xlsx`
}

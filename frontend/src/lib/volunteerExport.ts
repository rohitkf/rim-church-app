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
import type { Household, HouseholdMember } from './family'
import { ageFrom } from './celebrations'
import { formatPhoneInternational } from './phone'
import { ROLE_NAME } from './roleNames'

export interface ExportPerson {
  id: string
  first_name: string
  last_name: string
  /** Present only when the Owner is exporting (0126). */
  email?: string
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
  /**
   * Email and phone columns. The Owner's alone (0126), so off unless the
   * Owner is exporting; the columns are left out rather than left blank.
   */
  includeContacts?: boolean
  /** Include people who are on none of the selected teams. */
  includeUnassigned?: boolean
  /**
   * Households and the people in them (0149), the Owner's alone. When
   * present, a Families sheet and a Children sheet are added.
   */
  family?: { households: Household[]; members: HouseholdMember[] }
  /** The day ages are worked out on; today unless a test says otherwise. */
  today?: Date
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
    return ROLE_NAME.head
  }
  if (grants.some((g) => g.role_type === 'assisting_head' && g.department_id === teamId)) {
    return ROLE_NAME.assistant
  }
  return ROLE_NAME.member
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

  // Whoever is on a chosen team: its roster, and its Heads, who lead it
  // whether or not anybody also listed them as a member.
  const onSelectedTeam = new Set([
    ...memberships.map((m) => m.user_id),
    ...input.grants
      .filter((g) => g.department_id && selected.has(g.department_id))
      .filter((g) => g.role_type === 'department_head' || g.role_type === 'assisting_head')
      .map((g) => g.user_id),
  ])
  // "People on no team" means exactly that — an account nobody has put on
  // a roster yet. It used to mean everybody not on the chosen teams, so
  // ticking Media alone (with this on, as it was by default) exported the
  // whole church.
  const onAnyTeam = new Set(input.memberships.map((m) => m.user_id))
  const people = input.people
    .filter((p) => onSelectedTeam.has(p.id) || (input.includeUnassigned && !onAnyTeam.has(p.id)))
    .sort(byName)

  const roleWords = (userId: string) => {
    const words: string[] = []
    if (input.ownerId === userId) words.push(ROLE_NAME.owner)
    if (input.adminIds.has(userId)) words.push(ROLE_NAME.admin)
    for (const grant of grantsBy.get(userId) ?? []) {
      const where = grant.department_id ? ` (${teamName.get(grant.department_id) ?? '—'})` : ''
      if (grant.role_type === 'department_head') words.push(`${ROLE_NAME.head}${where}`)
      if (grant.role_type === 'assisting_head') words.push(`${ROLE_NAME.assistant}${where}`)
      if (grant.role_type === 'service_flow_coordinator') words.push(ROLE_NAME.serviceFlow)
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
      blank(p.email),
      blank(formatPhoneInternational(p.phone)),
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
      blank(person.email),
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
        { label: 'Visa comment', width: 40 },
        { label: 'DBS check', width: 12 },
      ],
      rows: people.map((p) => {
        const record = sensitive.get(p.id)
        return [
          p.first_name,
          p.last_name,
          blank(p.email),
          blank(record?.visa_type),
          blank(record?.visa_expiry),
          blank(record?.visa_note),
          record ? (record.has_dbs ? 'Yes' : 'No') : '',
        ]
      }),
    })
  }

  if (input.family) sheets.push(...familySheets(people, input.family, input.today ?? new Date()))

  return input.includeContacts ? sheets : sheets.map(withoutContacts)
}

/*
 * Families, from the households (0149): one row per person with their
 * address, spouse and children, and one row per child, so a Sunday
 * school list can be sorted by age or year without unpicking a cell.
 */
function familySheets(
  people: ExportPerson[],
  family: { households: Household[]; members: HouseholdMember[] },
  today: Date,
): ExportSheet[] {
  const householdById = new Map(family.households.map((h) => [h.id, h]))
  const inHousehold = (id: string | null | undefined) => family.members.filter((m) => m.household_id === id)
  const name = (m: HouseholdMember) =>
    `${m.person?.first_name ?? m.first_name ?? ''} ${m.person?.last_name ?? m.last_name ?? ''}`.trim()
  const dob = (m: HouseholdMember) => (m.person ? m.person.dob : m.dob) ?? null
  const age = (d: string | null) => {
    const years = ageFrom(d, today)
    return years === null ? '' : years
  }
  const address = (h: Household | undefined) =>
    h ? [h.address_line1, h.address_line2, h.town, h.postcode].filter(Boolean).join(', ') : ''
  const childLine = (m: HouseholdMember) => {
    const d = dob(m)
    const a = ageFrom(d, today)
    const bits = [d ? `${d}${a === null ? '' : `, ${a}`}` : null, m.year_group, m.school].filter(Boolean)
    return bits.length > 0 ? `${name(m)} (${bits.join('; ')})` : name(m)
  }

  const families: ExportSheet = {
    name: 'Families',
    columns: [
      { label: 'First name', width: 18 },
      { label: 'Last name', width: 18 },
      { label: 'Date of birth', width: 14 },
      { label: 'Age', width: 6 },
      { label: 'Address', width: 40 },
      { label: 'Spouse', width: 24 },
      { label: 'Spouse date of birth', width: 18 },
      { label: 'Spouse age', width: 10 },
      { label: 'Children', width: 60 },
      { label: 'Parents', width: 36 },
    ],
    rows: people.map((p) => {
      const homeId = family.members.find((m) => m.user_id === p.id && m.kind === 'adult')?.household_id
      const parentsId = family.members.find((m) => m.user_id === p.id && m.kind === 'child')?.household_id
      const home = inHousehold(homeId)
      const spouse = home.find((m) => m.kind === 'adult' && m.user_id !== p.id)
      const children = home.filter((m) => m.kind === 'child')
      const parents = inHousehold(parentsId).filter((m) => m.kind === 'adult')
      const spouseDob = spouse ? dob(spouse) : null
      return [
        p.first_name,
        p.last_name,
        blank(p.dob),
        age(p.dob ?? null),
        address(householdById.get(homeId ?? '') ?? householdById.get(parentsId ?? '')),
        spouse ? name(spouse) : '',
        blank(spouseDob),
        age(spouseDob),
        children.map(childLine).join('; '),
        parents.map(name).join(', '),
      ]
    }),
  }

  // Every child of a household somebody in this export lives in, once.
  const exported = new Set(people.map((p) => p.id))
  const homes = new Set(
    family.members.filter((m) => m.kind === 'adult' && m.user_id && exported.has(m.user_id)).map((m) => m.household_id),
  )
  const children: ExportSheet = {
    name: 'Children',
    columns: [
      { label: 'First name', width: 16 },
      { label: 'Last name', width: 16 },
      { label: 'Date of birth', width: 14 },
      { label: 'Age', width: 6 },
      { label: 'Gender', width: 8 },
      { label: 'Year group', width: 12 },
      { label: 'School', width: 26 },
      { label: 'Parents', width: 36 },
      { label: 'Address', width: 40 },
      { label: 'On the app', width: 10 },
    ],
    rows: family.members
      .filter((m) => m.kind === 'child' && homes.has(m.household_id))
      .map((m) => {
        const parents = inHousehold(m.household_id).filter((x) => x.kind === 'adult')
        const d = dob(m)
        return {
          sort: `${m.person?.last_name ?? m.last_name ?? ''} ${name(m)}`,
          row: [
            m.person?.first_name ?? m.first_name ?? '',
            m.person?.last_name ?? m.last_name ?? '',
            blank(d),
            age(d),
            m.gender === 'male' ? 'Boy' : m.gender === 'female' ? 'Girl' : '',
            blank(m.year_group),
            blank(m.school),
            parents.map(name).join(', '),
            address(householdById.get(m.household_id)),
            m.user_id ? 'Yes' : 'No',
          ] as ExportCell[],
        }
      })
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map((x) => x.row),
  }

  return [families, children]
}

const CONTACT_COLUMNS = new Set(['Email', 'Phone'])

/** The same sheet with its Email and Phone columns taken out. */
function withoutContacts(sheet: ExportSheet): ExportSheet {
  const keep = sheet.columns.map((c) => !CONTACT_COLUMNS.has(c.label))
  return {
    ...sheet,
    columns: sheet.columns.filter((_, i) => keep[i]),
    rows: sheet.rows.map((row) => row.filter((_, i) => keep[i])),
  }
}

/** Dated, so two exports a week apart don't overwrite each other. */
export function exportFileName(now: Date = new Date()): string {
  return `rim-volunteers-${now.toISOString().slice(0, 10)}.xlsx`
}

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
 *
 * And then everything else that is known (the Owner, November 2026: "as
 * detailed as possible [...] Every single details about that person"):
 * age and whether under 18, marital status, the address, when they
 * joined and last signed in, whether their details are finished and what
 * is missing, whether they are blocked, how often they have served; a
 * Serving sheet with every time on the rota; and a Guests sheet for the
 * people who take part without an account.
 *
 * Each of those is on the sheet only when the reader was sent it. A
 * column that would be empty for everybody is left out rather than
 * shipped blank: a blank reads as "no", and "not sent" is not "no".
 */
import type { MemberType, DepartmentMemberRow, SensitiveByUser } from './types'
import type { UserRole } from '../auth/types'
import type { Household, HouseholdMember } from './family'
import { ageFrom } from './celebrations'
import { ADULT_AGE, ownDobProblem } from './ownAge'
import { MISSING_TEXT, maritalLabel, visaLabel, type JoiningAnswers } from './joining'
import { formatPhoneInternational } from './phone'
import { emergencyRelationLabel } from './joining'
import { ROLE_NAME } from './roleNames'

export interface ExportPerson {
  id: string
  first_name: string
  last_name: string
  /** Present only when the Owner is exporting (0126). */
  email?: string
  phone?: string | null
  /** Who to ring about them (0301), with the contact details and never without. */
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  /** What that person is to them (0302), as its value; the sheet says the word. */
  emergency_contact_relation?: string | null
  dob?: string | null
  anniversary?: string | null
}

/** What `people_details()` (0322) hands whoever is sent contact details. */
export interface ExportDetails {
  marital_status: string | null
  joined_at: string | null
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}

/** How somebody's set-up stands (`people_setup()`, 0276/0304). */
export interface ExportSetup {
  /** Through the joining form at all. */
  joined: boolean
  /** The questions still unanswered, by name. */
  gaps: string[]
  notifications: boolean
  completed_at: string | null
}

/** One time on the rota. */
export interface ExportServing {
  user_id: string
  department_id: string
  role_label: string | null
  is_shadow?: boolean | null
  date: string
  service_type: string
}

/** Somebody who takes part without an account (the guest roll). */
export interface ExportGuest {
  id: string
  name: string
  title?: string | null
  note?: string | null
  became_member?: boolean | null
  teams: { department_id: string; member_type: MemberType }[]
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
  /** Marital status and the account's dates (0322), by user id: with contact details and never without. */
  details?: Map<string, ExportDetails>
  /** Whether their details are finished, by user id: for whoever may send the tour. */
  setup?: Map<string, ExportSetup>
  /** Who is blocked, when and why, by user id: for whoever may block. */
  blocks?: Map<string, { blocked_at: string; reason: string | null }>
  /** Who the database says is under 18 (0321). Without it, it is worked out from a date the reader was sent. */
  minors?: ReadonlySet<string>
  /** Every time on the rota the reader may see: a Serving sheet, and three columns a person. */
  serving?: ExportServing[]
  /** The guest roll: a Guests sheet. */
  guests?: ExportGuest[]
}

/** A blank cell reads better than the word "null" in a spreadsheet. */
const blank = (value: string | null | undefined): string => value ?? ''

const pad2 = (n: number) => String(n).padStart(2, '0')
/** A moment as a sheet sorts it: "2026-11-22 09:30", in the reader's own clock. */
export function sheetMoment(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
/** The day of a moment: "2026-11-22". */
const sheetDay = (iso: string | null | undefined): string => sheetMoment(iso).slice(0, 10)
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const yesNo = (value: boolean) => (value ? 'Yes' : 'No')

/** One column of a sheet that is there only when its data was sent. */
interface PersonColumn {
  label: string
  width: number
  when?: boolean
  value: (p: ExportPerson) => ExportCell
}

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

  const today = input.today ?? new Date()
  const todayIso = isoDay(today)
  const yearAgo = isoDay(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()))
  const anyDob = people.some((p) => !!p.dob)
  // An age only from a date that can be theirs: born today is not "0" (0321).
  const ageOf = (p: ExportPerson): number | null => (p.dob && !ownDobProblem(p.dob, today) ? ageFrom(p.dob, today) : null)
  const under18 = (p: ExportPerson): boolean | null => {
    if (input.minors) return input.minors.has(p.id)
    const age = ageOf(p)
    return age === null ? null : age < ADULT_AGE
  }
  // Their own home: a person is an adult in at most one household (0149).
  const homeOf = new Map<string, Household>()
  if (input.family) {
    const byId = new Map(input.family.households.map((h) => [h.id, h]))
    for (const m of input.family.members) {
      if (m.kind === 'adult' && m.user_id && byId.has(m.household_id)) homeOf.set(m.user_id, byId.get(m.household_id)!)
    }
  }
  // Every time on the rota, for the chosen teams: who, and how often.
  const servingRows = (input.serving ?? []).filter((r) => selected.has(r.department_id))
  const servedBy = new Map<string, ExportServing[]>()
  for (const row of servingRows) servedBy.set(row.user_id, [...(servedBy.get(row.user_id) ?? []), row])
  const served = (id: string) => servedBy.get(id) ?? []
  const gapWords = (gaps: string[]) =>
    gaps.map((g) => (g in MISSING_TEXT ? MISSING_TEXT[g as keyof JoiningAnswers].label : g)).join(', ')

  const personColumns: PersonColumn[] = [
    { label: 'First name', width: 18, value: (p) => p.first_name },
    { label: 'Last name', width: 18, value: (p) => p.last_name },
    { label: 'Email', width: 30, value: (p) => blank(p.email) },
    { label: 'Phone', width: 16, value: (p) => blank(formatPhoneInternational(p.phone)) },
    { label: 'Emergency contact', width: 24, value: (p) => blank(p.emergency_contact_name) },
    { label: 'Relationship', width: 18, value: (p) => blank(emergencyRelationLabel(p.emergency_contact_relation)) },
    { label: 'Emergency number', width: 18, value: (p) => blank(formatPhoneInternational(p.emergency_contact_phone)) },
    { label: 'Date of birth', width: 14, value: (p) => blank(p.dob) },
    { label: 'Age', width: 6, when: anyDob, value: (p) => ageOf(p) ?? '' },
    {
      label: 'Under 18',
      width: 9,
      when: !!input.minors || anyDob,
      value: (p) => {
        const young = under18(p)
        return young === null ? '' : yesNo(young)
      },
    },
    { label: 'Marital status', width: 14, when: !!input.details, value: (p) => blank(maritalLabel(input.details?.get(p.id)?.marital_status)) },
    { label: 'Wedding anniversary', width: 18, value: (p) => blank(p.anniversary) },
    { label: 'Address line 1', width: 26, when: !!input.family, value: (p) => blank(homeOf.get(p.id)?.address_line1) },
    { label: 'Address line 2', width: 20, when: !!input.family, value: (p) => blank(homeOf.get(p.id)?.address_line2) },
    { label: 'Town', width: 16, when: !!input.family, value: (p) => blank(homeOf.get(p.id)?.town) },
    { label: 'Postcode', width: 10, when: !!input.family, value: (p) => blank(homeOf.get(p.id)?.postcode) },
    { label: 'Core teams', width: 30, value: (p) => teamsFor(p.id, 'core').join(', ') },
    { label: 'Guest teams', width: 24, value: (p) => teamsFor(p.id, 'guest').join(', ') },
    { label: 'Roles', width: 34, value: (p) => roleWords(p.id) },
    { label: 'Account made', width: 12, when: !!input.details, value: (p) => sheetDay(input.details?.get(p.id)?.joined_at) },
    {
      label: 'Email confirmed',
      width: 14,
      when: !!input.details,
      value: (p) => {
        const d = input.details?.get(p.id)
        return d ? (d.email_confirmed_at ? sheetDay(d.email_confirmed_at) : 'No') : ''
      },
    },
    {
      label: 'Last signed in',
      width: 17,
      when: !!input.details,
      value: (p) => {
        const d = input.details?.get(p.id)
        return d ? (d.last_sign_in_at ? sheetMoment(d.last_sign_in_at) : 'Never') : ''
      },
    },
    {
      label: 'Details complete',
      width: 14,
      when: !!input.setup,
      value: (p) => {
        const row = input.setup?.get(p.id)
        return row ? yesNo(row.joined && row.gaps.length === 0) : ''
      },
    },
    {
      label: 'Still missing',
      width: 40,
      when: !!input.setup,
      value: (p) => {
        const row = input.setup?.get(p.id)
        if (!row) return ''
        return row.joined ? gapWords(row.gaps) : 'Has not been through the joining form'
      },
    },
    { label: 'Details finished on', width: 17, when: !!input.setup, value: (p) => sheetMoment(input.setup?.get(p.id)?.completed_at) },
    {
      label: 'Notifications on',
      width: 14,
      when: !!input.setup,
      value: (p) => {
        const row = input.setup?.get(p.id)
        return row ? yesNo(row.notifications) : ''
      },
    },
    { label: 'Blocked', width: 17, when: !!input.blocks, value: (p) => sheetMoment(input.blocks?.get(p.id)?.blocked_at) },
    { label: 'Block reason', width: 30, when: !!input.blocks, value: (p) => blank(input.blocks?.get(p.id)?.reason) },
    {
      label: 'Times on the rota, last 12 months',
      width: 14,
      when: !!input.serving,
      value: (p) => served(p.id).filter((r) => r.date >= yearAgo && r.date <= todayIso).length,
    },
    {
      label: 'Last served',
      width: 12,
      when: !!input.serving,
      value: (p) => served(p.id).map((r) => r.date).filter((d) => d <= todayIso).sort().at(-1) ?? '',
    },
    {
      label: 'Next on the rota',
      width: 14,
      when: !!input.serving,
      value: (p) => served(p.id).map((r) => r.date).filter((d) => d > todayIso).sort()[0] ?? '',
    },
  ]
  const shownColumns = personColumns.filter((c) => c.when !== false)
  const volunteers: ExportSheet = {
    name: 'Volunteers',
    columns: shownColumns.map(({ label, width }) => ({ label, width })),
    rows: people.map((p) => shownColumns.map((c) => c.value(p))),
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
      { label: 'On the team since', width: 14 },
      ...(input.minors || anyDob ? [{ label: 'Under 18', width: 9 }] : []),
    ],
    rows: membershipRows.map(({ membership, person }) => {
      const young = under18(person)
      return [
        teamName.get(membership.department_id) ?? '',
        MEMBER_TYPE_LABEL[membership.member_type],
        designationIn(grantsBy.get(person.id) ?? [], membership.department_id),
        person.first_name,
        person.last_name,
        blank(person.email),
        blank(formatPhoneInternational(person.phone)),
        sheetDay(membership.created_at),
        ...(input.minors || anyDob ? [young === null ? '' : yesNo(young)] : []),
      ]
    }),
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
        { label: 'Visa type', width: 26 },
        { label: 'Has an expiry date', width: 14 },
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
          // The words the form offered, not the value kept ("ilr").
          blank(visaLabel(record?.visa_type)),
          record ? (record.visa_has_expiry === true ? 'Yes' : record.visa_has_expiry === false ? 'No' : '') : '',
          blank(record?.visa_expiry),
          blank(record?.visa_note),
          record ? (record.has_dbs ? 'Yes' : 'No') : '',
        ]
      }),
    })
  }

  if (input.family) sheets.push(...familySheets(people, input.family, today))

  if (input.serving) {
    const included = new Set(people.map((p) => p.id))
    const rows = servingRows
      .filter((r) => included.has(r.user_id))
      .map((r) => ({ r, person: personById.get(r.user_id)! }))
      // Newest first: what is coming, then what has been.
      .sort((a, b) => b.r.date.localeCompare(a.r.date) || a.r.service_type.localeCompare(b.r.service_type) || byName(a.person, b.person))
    sheets.push({
      name: 'Serving',
      columns: [
        { label: 'Date', width: 12 },
        { label: 'Service', width: 26 },
        { label: 'Team', width: 22 },
        { label: 'Role', width: 22 },
        { label: 'Shadowing', width: 10 },
        { label: 'First name', width: 18 },
        { label: 'Last name', width: 18 },
        { label: 'When', width: 10 },
      ],
      rows: rows.map(({ r, person }) => [
        r.date,
        r.service_type,
        teamName.get(r.department_id) ?? '',
        blank(r.role_label),
        r.is_shadow ? 'Yes' : '',
        person.first_name,
        person.last_name,
        r.date > todayIso ? 'Coming' : r.date === todayIso ? 'Today' : 'Past',
      ]),
    })
  }

  if (input.guests) {
    const teamsOf = (g: ExportGuest, type: MemberType) =>
      g.teams
        .filter((t) => t.member_type === type && selected.has(t.department_id))
        .map((t) => teamName.get(t.department_id) ?? '')
        .filter(Boolean)
        .sort()
        .join(', ')
    sheets.push({
      name: 'Guests',
      columns: [
        { label: 'Name', width: 24 },
        { label: 'Title', width: 10 },
        { label: 'Note', width: 40 },
        { label: 'Core teams', width: 26 },
        { label: 'Guest teams', width: 26 },
        { label: 'Has since joined', width: 14 },
      ],
      rows: input.guests
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => [g.name, blank(g.title), blank(g.note), teamsOf(g, 'core'), teamsOf(g, 'guest'), g.became_member ? 'Yes' : '']),
    })
  }

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

const CONTACT_COLUMNS = new Set([
  'Email', 'Phone', 'Emergency contact', 'Relationship', 'Emergency number',
  // With contact details and never without (0277, 0322).
  'Address line 1', 'Address line 2', 'Town', 'Postcode', 'Marital status', 'Account made', 'Email confirmed', 'Last signed in',
])

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

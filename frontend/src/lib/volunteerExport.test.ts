import { describe, expect, it } from 'vitest'
import { buildVolunteerWorkbook, exportFileName, sheetMoment, type ExportInput, type ExportSheet } from './volunteerExport'
import type { DepartmentMemberRow } from './types'

const person = (id: string, first: string, last: string, extra: Record<string, unknown> = {}) => ({
  id,
  first_name: first,
  last_name: last,
  email: `${first.toLowerCase()}@rim.org`,
  phone: null,
  dob: null,
  anniversary: null,
  ...extra,
})

const membership = (
  userId: string,
  departmentId: string,
  member_type: 'core' | 'guest' = 'core',
): DepartmentMemberRow => ({
  id: `${userId}-${departmentId}`,
  department_id: departmentId,
  user_id: userId,
  member_type,
  created_at: '2026-01-01T00:00:00Z',
  profiles: null,
})

const grant = (userId: string, role_type: string, department_id: string | null = null) => ({
  id: `${userId}-${role_type}-${department_id}`,
  user_id: userId,
  role_type: role_type as never,
  department_id,
  service_id: null,
})

const base = (over: Partial<ExportInput> = {}): ExportInput => ({
  people: [
    person('u1', 'Grace', 'Mensah', {
      phone: '07000',
      dob: '1990-04-02',
      emergency_contact_name: 'Ama Mensah',
      emergency_contact_relation: 'mother',
      emergency_contact_phone: '+447812345678',
    }),
    person('u2', 'Tunde', 'Alabi'),
  ],
  teams: [
    { id: 'd1', name: 'Audio' },
    { id: 'd2', name: 'Media' },
  ],
  memberships: [membership('u1', 'd1'), membership('u2', 'd2'), membership('u2', 'd1', 'guest')],
  grants: [grant('u1', 'department_head', 'd1')],
  selectedTeamIds: ['d1', 'd2'],
  adminIds: new Set<string>(),
  ownerId: null,
  includeUnassigned: true,
  // The Owner's export, which is the only one with contact details.
  includeContacts: true,
  today: TODAY,
  ...over,
})

const sheet = (input: ExportInput, name: string) =>
  buildVolunteerWorkbook(input).find((s) => s.name === name)!

/** A column by its heading, top to bottom: a sheet gains columns, and a test should not count them. */
const column = (of: ExportSheet, label: string) => {
  const at = of.columns.findIndex((c) => c.label === label)
  if (at < 0) throw new Error(`no column called ${label}`)
  return of.rows.map((row) => row[at])
}
/** One row as heading → value. */
const rowOf = (of: ExportSheet, index: number) => Object.fromEntries(of.columns.map((c, i) => [c.label, of.rows[index][i]]))
// Ages are worked out on a day; every test here is on this one.
const TODAY = new Date('2026-10-11T12:00:00')

describe('the volunteer workbook', () => {
  it('carries the whole profile, not just the name on the page', () => {
    const volunteers = sheet(base(), 'Volunteers')
    // With nothing more sent than the page has: a date of birth brings an age and whether under 18.
    expect(volunteers.columns.map((c) => c.label)).toEqual([
      'First name',
      'Last name',
      'Email',
      'Phone',
      'Emergency contact',
      'Relationship',
      'Emergency number',
      'Date of birth',
      'Age',
      'Under 18',
      'Wedding anniversary',
      'Core teams',
      'Guest teams',
      'Roles',
    ])
    // Alphabetical by surname: Alabi before Mensah.
    expect(column(volunteers, 'Last name')).toEqual(['Alabi', 'Mensah'])
    expect(rowOf(volunteers, 1)).toEqual({
      'First name': 'Grace',
      'Last name': 'Mensah',
      Email: 'grace@rim.org',
      Phone: '07000',
      // Who to ring about her (0301), the number as it would be dialled.
      'Emergency contact': 'Ama Mensah',
      // Who she is to her (0302), as the word and not the stored value.
      Relationship: 'Mother',
      'Emergency number': '+44 7812 345678',
      'Date of birth': '1990-04-02',
      Age: 36,
      'Under 18': 'No',
      'Wedding anniversary': '',
      'Core teams': 'Audio',
      'Guest teams': '',
      Roles: 'Team Head (Audio)',
    })
    // Every row lines up with its headings.
    for (const row of volunteers.rows) expect(row).toHaveLength(volunteers.columns.length)
  })

  it('keeps core and guest teams apart in the same row', () => {
    const row = rowOf(sheet(base(), 'Volunteers'), 0)
    expect(row['Core teams']).toBe('Media')
    expect(row['Guest teams']).toBe('Audio')
  })

  it('writes a missing value as a blank rather than the word null', () => {
    const row = rowOf(sheet(base(), 'Volunteers'), 0)
    for (const label of ['Phone', 'Emergency contact', 'Relationship', 'Emergency number', 'Date of birth', 'Age', 'Under 18']) {
      expect(row[label], label).toBe('')
    }
  })

  it('only reports on the teams that were ticked', () => {
    const only = base({ selectedTeamIds: ['d1'], includeUnassigned: false })
    expect(sheet(only, 'Teams').rows.map((r) => r[0])).toEqual(['Audio'])
    // Media is not in the cut, so a Media-only membership doesn't appear…
    expect(sheet(only, 'Team members').rows.map((r) => r[0])).toEqual(['Audio', 'Audio'])
    // …and neither does Media in anyone's team list.
    expect(column(sheet(only, 'Volunteers'), 'Core teams')).toEqual(['', 'Audio'])
  })

  it('leaves out people on none of the chosen teams when asked to', () => {
    const input = base({ selectedTeamIds: ['d2'], includeUnassigned: false })
    expect(sheet(input, 'Volunteers').rows.map((r) => r[1])).toEqual(['Alabi'])
  })

  it('keeps an account with no team when asked to include it', () => {
    const input = base({
      people: [...base().people, person('u3', 'New', 'Person')],
      selectedTeamIds: ['d1'],
      includeUnassigned: true,
    })
    expect(sheet(input, 'Volunteers').rows.map((r) => r[1])).toContain('Person')
  })

  // Ticking Media alone exported the whole church: "include people on no
  // team" took in everybody not on Media, members of every other team too.
  it('exports only the chosen team, even when people on no team are included', () => {
    const input = base({
      people: [...base().people, person('u3', 'New', 'Person'), person('u4', 'Other', 'Team')],
      memberships: [...base().memberships, membership('u4', 'd3')],
      teams: [...base().teams, { id: 'd3', name: 'Worship' }],
      selectedTeamIds: ['d2'],
      includeUnassigned: true,
    })
    expect(sheet(input, 'Volunteers').rows.map((r) => r[1])).toEqual(['Alabi', 'Person'])
    expect(sheet({ ...input, includeUnassigned: false }, 'Volunteers').rows.map((r) => r[1])).toEqual(['Alabi'])
  })

  it('counts a team’s Head as one of its people, roster row or not', () => {
    const input = base({
      people: [...base().people, person('u5', 'Head', 'Only')],
      grants: [...base().grants, grant('u5', 'department_head', 'd2')],
      selectedTeamIds: ['d2'],
      includeUnassigned: false,
    })
    expect(sheet(input, 'Volunteers').rows.map((r) => r[1])).toEqual(['Alabi', 'Only'])
  })

  it('names each person by what they are in that team, team by team', () => {
    const rows = sheet(base(), 'Team members').rows
    // …with the day they were put on it, and whether they are under 18 where that is known.
    expect(rows).toEqual([
      ['Audio', 'Guest', 'Team Member', 'Tunde', 'Alabi', 'tunde@rim.org', '', '2026-01-01', ''],
      ['Audio', 'Core', 'Team Head', 'Grace', 'Mensah', 'grace@rim.org', '07000', '2026-01-01', 'No'],
      ['Media', 'Core', 'Team Member', 'Tunde', 'Alabi', 'tunde@rim.org', '', '2026-01-01', ''],
    ])
  })

  it('counts each team and names who leads it', () => {
    expect(sheet(base(), 'Teams').rows[0]).toEqual(['Audio', 1, 1, 'Grace Mensah', ''])
  })

  it('spells out the app-wide roles alongside the team ones', () => {
    const input = base({ adminIds: new Set(['u2']), ownerId: 'u2' })
    expect(rowOf(sheet(input, 'Volunteers'), 0).Roles).toBe('Owner, Admin')
  })

  it('leaves compliance out of the file unless it was asked for', () => {
    expect(buildVolunteerWorkbook(base()).map((s) => s.name)).toEqual([
      'Volunteers',
      'Team members',
      'Teams',
    ])
  })

  it('puts compliance on its own sheet, and says No rather than nothing for a missing check', () => {
    const input = base({
      sensitive: new Map([['u1', { visa_type: 'skilled_worker', visa_has_expiry: true, visa_expiry: '2028-01-31', has_dbs: true, visa_note: 'Renewal sent 1 Oct' }]]),
    })
    const rows = sheet(input, 'Compliance').rows
    // The status in the words the form offered, and whether it has an expiry at all.
    expect(rows[1]).toEqual(['Grace', 'Mensah', 'grace@rim.org', 'Skilled Worker visa', 'Yes', '2028-01-31', 'Renewal sent 1 Oct', 'Yes'])
    // Nobody has recorded anything for Alabi: blank, not a false negative.
    expect(rows[0]).toEqual(['Tunde', 'Alabi', 'tunde@rim.org', '', '', '', '', ''])
  })
})

describe('the file name', () => {
  it('carries the date, so two exports a week apart do not collide', () => {
    expect(exportFileName(new Date('2026-08-28T11:00:00Z'))).toBe('rim-volunteers-2026-08-28.xlsx')
  })

  it('leaves email and phone out altogether for anybody but the Owner', () => {
    const input = base({ includeContacts: false })
    for (const name of ['Volunteers', 'Team members']) {
      const labels = sheet(input, name).columns.map((c) => c.label)
      expect(labels, name).not.toContain('Email')
      expect(labels, name).not.toContain('Phone')
      // Every row still lines up with its header.
      for (const row of sheet(input, name).rows) expect(row).toHaveLength(labels.length)
    }
    expect(JSON.stringify(buildVolunteerWorkbook(input))).not.toContain('@rim.org')
    expect(JSON.stringify(buildVolunteerWorkbook(input))).not.toContain('07000')
    // Who to ring goes with them: the same people's to see (0301).
    expect(sheet(input, 'Volunteers').columns.map((c) => c.label)).not.toContain('Emergency contact')
    expect(sheet(input, 'Volunteers').columns.map((c) => c.label)).not.toContain('Emergency number')
    expect(sheet(input, 'Volunteers').columns.map((c) => c.label)).not.toContain('Relationship')
    expect(JSON.stringify(buildVolunteerWorkbook(input))).not.toContain('Ama Mensah')
    expect(JSON.stringify(buildVolunteerWorkbook(input))).not.toContain('7812')
  })
})

describe('families in the export (0149)', () => {
  const member = (over: Record<string, unknown>) => ({
    id: String(over.id),
    household_id: 'h1',
    kind: 'child' as 'adult' | 'child',
    user_id: null as string | null,
    first_name: null as string | null,
    last_name: null as string | null,
    dob: null as string | null,
    gender: null as 'male' | 'female' | null,
    school: null as string | null,
    year_group: null as string | null,
    person: null as { id: string; first_name: string; last_name: string; dob: string | null } | null,
    ...over,
  })
  const family = {
    households: [{ id: 'h1', address_line1: '1 High St', address_line2: null, town: 'Leeds', postcode: 'LS1 1AA' }],
    members: [
      member({ id: 'a', kind: 'adult', user_id: 'u1', person: { id: 'u1', first_name: 'Grace', last_name: 'Mensah', dob: '1990-04-02' } }),
      member({ id: 'b', kind: 'adult', first_name: 'Kofi', last_name: 'Mensah', dob: '1988-01-15' }),
      member({ id: 'c', first_name: 'Ann', last_name: 'Mensah', dob: '2015-03-12', gender: 'female', school: 'St Mary’s', year_group: 'Year 6' }),
    ],
  }
  const today = new Date('2026-10-11T12:00:00')

  it('leaves families out unless they were asked for', () => {
    expect(buildVolunteerWorkbook(base()).map((s) => s.name)).not.toContain('Families')
  })

  it('gives each person their address, spouse with date of birth and age, and children', () => {
    const rows = sheet(base({ family, today }), 'Families').rows
    const grace = rows.find((r) => r[0] === 'Grace')!
    expect(grace).toEqual([
      'Grace',
      'Mensah',
      '1990-04-02',
      36,
      '1 High St, Leeds, LS1 1AA',
      'Kofi Mensah',
      '1988-01-15',
      38,
      'Ann Mensah (2015-03-12, 11; Year 6; St Mary’s)',
      '',
    ])
    // Somebody with no household is still listed, with nothing to say.
    expect(rows.find((r) => r[0] === 'Tunde')!.slice(4)).toEqual(['', '', '', '', '', ''])
  })

  it('lists every child on a sheet of their own, with their parents', () => {
    const rows = sheet(base({ family, today }), 'Children').rows
    expect(rows).toEqual([
      ['Ann', 'Mensah', '2015-03-12', 11, 'Girl', 'Year 6', 'St Mary’s', 'Grace Mensah, Kofi Mensah', '1 High St, Leeds, LS1 1AA', 'No'],
    ])
  })
})

/*
 * "As detailed as possible [...] Every single details about that person"
 * (the Owner, November 2026). Each of these is on the sheet when the
 * reader was sent it, and its column is left out when they were not.
 */
describe('everything else that is known about a person', () => {
  const labels = (input: ExportInput) => sheet(input, 'Volunteers').columns.map((c) => c.label)

  it('says how old somebody is, and whether they are under 18', () => {
    const input = base({ people: [person('u1', 'Grace', 'Mensah', { dob: '1990-04-02' }), person('u2', 'Tunde', 'Alabi', { dob: '2011-06-01' })] })
    const of = sheet(input, 'Volunteers')
    expect(column(of, 'Age')).toEqual([15, 36])
    expect(column(of, 'Under 18')).toEqual(['Yes', 'No'])
  })

  it('gives no age for a date of birth that cannot be theirs, rather than 0', () => {
    const input = base({ people: [person('u1', 'Grace', 'Mensah', { dob: '2026-10-11' }), person('u2', 'Tunde', 'Alabi', { dob: '1980-01-01' })] })
    const of = sheet(input, 'Volunteers')
    expect(column(of, 'Age')).toEqual([46, ''])
    expect(column(of, 'Under 18')).toEqual(['No', ''])
  })

  it('takes who is under 18 from the database when it says, date or no date', () => {
    const input = base({ people: [person('u1', 'Grace', 'Mensah'), person('u2', 'Tunde', 'Alabi')], minors: new Set(['u2']) })
    expect(column(sheet(input, 'Volunteers'), 'Under 18')).toEqual(['Yes', 'No'])
    expect(column(sheet(input, 'Team members'), 'Under 18')).toEqual(['Yes', 'No', 'Yes'])
  })

  it('leaves age out altogether for a reader who was sent no dates', () => {
    const input = base({ people: [person('u1', 'Grace', 'Mensah'), person('u2', 'Tunde', 'Alabi')] })
    expect(labels(input)).not.toContain('Age')
    expect(labels(input)).not.toContain('Under 18')
  })

  it('carries marital status in words, and the account’s own dates', () => {
    const details = new Map([
      ['u1', { marital_status: 'married', joined_at: '2026-01-05T09:00:00Z', email_confirmed_at: '2026-01-05T09:10:00Z', last_sign_in_at: '2026-10-10T08:00:00Z' }],
      ['u2', { marital_status: null, joined_at: '2026-03-01T09:00:00Z', email_confirmed_at: null, last_sign_in_at: null }],
    ])
    const of = sheet(base({ details }), 'Volunteers')
    expect(column(of, 'Marital status')).toEqual(['', 'Married'])
    expect(column(of, 'Account made')).toEqual(['2026-03-01', '2026-01-05'])
    // Somebody who never confirmed and never signed in is said so, not left blank.
    expect(column(of, 'Email confirmed')).toEqual(['No', '2026-01-05'])
    expect(column(of, 'Last signed in')).toEqual(['Never', sheetMoment('2026-10-10T08:00:00Z')])
  })

  it('carries the address, a part to a column, when households were sent', () => {
    const family = {
      households: [{ id: 'h1', address_line1: '1 High St', address_line2: 'Flat 2', town: 'Leeds', postcode: 'LS1 1AA' }],
      members: [{ id: 'a', household_id: 'h1', kind: 'adult' as const, user_id: 'u1', first_name: null, last_name: null, dob: null, gender: null, school: null, year_group: null, person: null }],
    }
    const of = sheet(base({ family }), 'Volunteers')
    expect(rowOf(of, 1)).toMatchObject({ 'Address line 1': '1 High St', 'Address line 2': 'Flat 2', Town: 'Leeds', Postcode: 'LS1 1AA' })
    expect(rowOf(of, 0)).toMatchObject({ 'Address line 1': '', Postcode: '' })
  })

  it('says whether their details are finished, what is missing in the form’s own words, and when they finished', () => {
    const setup = new Map([
      ['u1', { joined: true, gaps: [], notifications: true, completed_at: '2026-02-01T10:00:00Z' }],
      ['u2', { joined: true, gaps: ['dob', 'postcode'], notifications: false, completed_at: null }],
    ])
    const of = sheet(base({ setup }), 'Volunteers')
    expect(column(of, 'Details complete')).toEqual(['No', 'Yes'])
    expect(column(of, 'Still missing')).toEqual(['Date of birth, Postcode', ''])
    expect(column(of, 'Details finished on')).toEqual(['', sheetMoment('2026-02-01T10:00:00Z')])
    expect(column(of, 'Notifications on')).toEqual(['No', 'Yes'])
  })

  it('says so of somebody who has never been through the form', () => {
    const setup = new Map([['u2', { joined: false, gaps: [], notifications: false, completed_at: null }]])
    const of = sheet(base({ setup }), 'Volunteers')
    expect(rowOf(of, 0)).toMatchObject({ 'Details complete': 'No', 'Still missing': 'Has not been through the joining form' })
  })

  it('says who is blocked, since when and why', () => {
    const blocks = new Map([['u2', { blocked_at: '2026-09-01T12:00:00Z', reason: 'Asked to step back' }]])
    const of = sheet(base({ blocks }), 'Volunteers')
    expect(column(of, 'Blocked')).toEqual([sheetMoment('2026-09-01T12:00:00Z'), ''])
    expect(column(of, 'Block reason')).toEqual(['Asked to step back', ''])
  })

  const serving = [
    { user_id: 'u1', department_id: 'd1', role_label: 'Front of house', date: '2026-10-04', service_type: 'English Service' },
    { user_id: 'u1', department_id: 'd1', role_label: 'Front of house', date: '2026-09-06', service_type: 'English Service' },
    { user_id: 'u1', department_id: 'd1', role_label: 'Monitors', is_shadow: true, date: '2026-10-18', service_type: 'English Service' },
    // More than a year ago: on the Serving sheet, not in the count.
    { user_id: 'u1', department_id: 'd1', role_label: 'Front of house', date: '2025-06-01', service_type: 'English Service' },
    { user_id: 'u2', department_id: 'd2', role_label: 'Camera', date: '2026-10-11', service_type: 'Malayalam Service' },
  ]

  it('counts how often somebody has served, when they last did and when they next will', () => {
    const of = sheet(base({ serving }), 'Volunteers')
    expect(rowOf(of, 1)).toMatchObject({ 'Times on the rota, last 12 months': 2, 'Last served': '2026-10-04', 'Next on the rota': '2026-10-18' })
    // Serving today counts as served, and nothing is coming.
    expect(rowOf(of, 0)).toMatchObject({ 'Times on the rota, last 12 months': 1, 'Last served': '2026-10-11', 'Next on the rota': '' })
  })

  it('lists every time on the rota on a Serving sheet, newest first', () => {
    const rows = sheet(base({ serving }), 'Serving').rows
    expect(rows).toEqual([
      ['2026-10-18', 'English Service', 'Audio', 'Monitors', 'Yes', 'Grace', 'Mensah', 'Coming'],
      ['2026-10-11', 'Malayalam Service', 'Media', 'Camera', '', 'Tunde', 'Alabi', 'Today'],
      ['2026-10-04', 'English Service', 'Audio', 'Front of house', '', 'Grace', 'Mensah', 'Past'],
      ['2026-09-06', 'English Service', 'Audio', 'Front of house', '', 'Grace', 'Mensah', 'Past'],
      ['2025-06-01', 'English Service', 'Audio', 'Front of house', '', 'Grace', 'Mensah', 'Past'],
    ])
  })

  it('keeps the Serving sheet to the teams that were ticked', () => {
    const only = base({ serving, selectedTeamIds: ['d2'], includeUnassigned: false })
    expect(sheet(only, 'Serving').rows.map((r) => r[2])).toEqual(['Media'])
  })

  it('lists the people who take part without an account on a Guests sheet', () => {
    const guests = [
      { id: 'g1', name: 'Saju Wigan', title: 'Ps', note: 'Pastor from Harlow', became_member: false, teams: [{ department_id: 'd1', member_type: 'guest' as const }] },
      { id: 'g2', name: 'Anil Joy', title: null, note: null, became_member: true, teams: [{ department_id: 'd2', member_type: 'core' as const }, { department_id: 'd9', member_type: 'core' as const }] },
    ]
    expect(sheet(base({ guests }), 'Guests').rows).toEqual([
      ['Anil Joy', '', '', 'Media', '', 'Yes'],
      ['Saju Wigan', 'Ps', 'Pastor from Harlow', '', 'Audio', ''],
    ])
  })

  it('adds none of those sheets or columns when nothing of the kind was sent', () => {
    expect(buildVolunteerWorkbook(base()).map((s) => s.name)).toEqual(['Volunteers', 'Team members', 'Teams'])
    for (const label of ['Marital status', 'Address line 1', 'Details complete', 'Blocked', 'Last served', 'Last signed in']) {
      expect(labels(base()), label).not.toContain(label)
    }
  })

  it('takes the address, marital status and the account’s dates out with the contact details', () => {
    const family = {
      households: [{ id: 'h1', address_line1: '1 High St', address_line2: null, town: 'Leeds', postcode: 'LS1 1AA' }],
      members: [{ id: 'a', household_id: 'h1', kind: 'adult' as const, user_id: 'u1', first_name: null, last_name: null, dob: null, gender: null, school: null, year_group: null, person: null }],
    }
    const details = new Map([['u1', { marital_status: 'married', joined_at: '2026-01-05T09:00:00Z', email_confirmed_at: null, last_sign_in_at: null }]])
    const input = base({ family, details, includeContacts: false })
    for (const label of ['Address line 1', 'Town', 'Postcode', 'Marital status', 'Account made', 'Email confirmed', 'Last signed in']) {
      expect(labels(input), label).not.toContain(label)
    }
    expect(JSON.stringify(sheet(input, 'Volunteers'))).not.toContain('High St')
    for (const row of sheet(input, 'Volunteers').rows) expect(row).toHaveLength(labels(input).length)
  })
})

describe('a moment on a sheet', () => {
  it('is written so that it sorts, in the reader’s own clock', () => {
    expect(sheetMoment('2026-11-22T09:30:00')).toBe('2026-11-22 09:30')
  })
  it('is blank when there is none, or it is not a moment', () => {
    expect(sheetMoment(null)).toBe('')
    expect(sheetMoment('not a date')).toBe('')
  })
})

describe('somebody with one name (0323)', () => {
  it('is filed under that name, not ahead of everybody under a blank surname', () => {
    const input = base({
      people: [person('u1', 'Grace', 'Mensah'), person('u2', 'Tunde', 'Alabi'), person('u3', 'Madonna', '')],
      memberships: [membership('u1', 'd1'), membership('u2', 'd2'), membership('u3', 'd1')],
    })
    const of = sheet(input, 'Volunteers')
    expect(column(of, 'First name')).toEqual(['Tunde', 'Madonna', 'Grace'])
    expect(column(of, 'Last name')).toEqual(['Alabi', '', 'Mensah'])
  })
})


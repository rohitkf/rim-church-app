import { describe, expect, it } from 'vitest'
import { buildVolunteerWorkbook, exportFileName, type ExportInput } from './volunteerExport'
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
  people: [person('u1', 'Grace', 'Mensah', { phone: '07000', dob: '1990-04-02' }), person('u2', 'Tunde', 'Alabi')],
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
  ...over,
})

const sheet = (input: ExportInput, name: string) =>
  buildVolunteerWorkbook(input).find((s) => s.name === name)!

describe('the volunteer workbook', () => {
  it('carries the whole profile, not just the name on the page', () => {
    const volunteers = sheet(base(), 'Volunteers')
    expect(volunteers.columns.map((c) => c.label)).toEqual([
      'First name',
      'Last name',
      'Email',
      'Phone',
      'Date of birth',
      'Wedding anniversary',
      'Core teams',
      'Guest teams',
      'Roles',
    ])
    // Alphabetical by surname: Alabi before Mensah.
    expect(volunteers.rows[0][1]).toBe('Alabi')
    expect(volunteers.rows[1]).toEqual([
      'Grace',
      'Mensah',
      'grace@rim.org',
      '07000',
      '1990-04-02',
      '',
      'Audio',
      '',
      'Team Head (Audio)',
    ])
  })

  it('keeps core and guest teams apart in the same row', () => {
    const row = sheet(base(), 'Volunteers').rows[0]
    expect(row[6]).toBe('Media') // core
    expect(row[7]).toBe('Audio') // guest
  })

  it('writes a missing value as a blank rather than the word null', () => {
    const row = sheet(base(), 'Volunteers').rows[0]
    expect(row[3]).toBe('')
    expect(row[4]).toBe('')
  })

  it('only reports on the teams that were ticked', () => {
    const only = base({ selectedTeamIds: ['d1'], includeUnassigned: false })
    expect(sheet(only, 'Teams').rows.map((r) => r[0])).toEqual(['Audio'])
    // Media is not in the cut, so a Media-only membership doesn't appear…
    expect(sheet(only, 'Team members').rows.map((r) => r[0])).toEqual(['Audio', 'Audio'])
    // …and neither does Media in anyone's team list.
    expect(sheet(only, 'Volunteers').rows.map((r) => r[6])).toEqual(['', 'Audio'])
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
    expect(rows).toEqual([
      ['Audio', 'Guest', 'Team Member', 'Tunde', 'Alabi', 'tunde@rim.org', ''],
      ['Audio', 'Core', 'Team Head', 'Grace', 'Mensah', 'grace@rim.org', '07000'],
      ['Media', 'Core', 'Team Member', 'Tunde', 'Alabi', 'tunde@rim.org', ''],
    ])
  })

  it('counts each team and names who leads it', () => {
    expect(sheet(base(), 'Teams').rows[0]).toEqual(['Audio', 1, 1, 'Grace Mensah', ''])
  })

  it('spells out the app-wide roles alongside the team ones', () => {
    const input = base({ adminIds: new Set(['u2']), ownerId: 'u2' })
    const alabi = sheet(input, 'Volunteers').rows[0]
    expect(alabi[8]).toBe('Owner, Admin')
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
      sensitive: new Map([['u1', { visa_type: 'Skilled Worker', visa_expiry: '2028-01-31', has_dbs: true, visa_note: 'Renewal sent 1 Oct' }]]),
    })
    const rows = sheet(input, 'Compliance').rows
    expect(rows[1]).toEqual(['Grace', 'Mensah', 'grace@rim.org', 'Skilled Worker', '2028-01-31', 'Renewal sent 1 Oct', 'Yes'])
    // Nobody has recorded anything for Alabi: blank, not a false negative.
    expect(rows[0]).toEqual(['Tunde', 'Alabi', 'tunde@rim.org', '', '', '', ''])
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

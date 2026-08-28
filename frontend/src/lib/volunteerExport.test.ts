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
      'Department Head (Audio)',
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

  it('names each person by what they are in that team, team by team', () => {
    const rows = sheet(base(), 'Team members').rows
    expect(rows).toEqual([
      ['Audio', 'Guest', 'Team Member', 'Tunde', 'Alabi', 'tunde@rim.org', ''],
      ['Audio', 'Core', 'Department Head', 'Grace', 'Mensah', 'grace@rim.org', '07000'],
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
      sensitive: new Map([['u1', { visa_type: 'Skilled Worker', visa_expiry: '2028-01-31', has_dbs: true }]]),
    })
    const rows = sheet(input, 'Compliance').rows
    expect(rows[1]).toEqual(['Grace', 'Mensah', 'grace@rim.org', 'Skilled Worker', '2028-01-31', 'Yes'])
    // Nobody has recorded anything for Alabi: blank, not a false negative.
    expect(rows[0]).toEqual(['Tunde', 'Alabi', 'tunde@rim.org', '', '', ''])
  })
})

describe('the file name', () => {
  it('carries the date, so two exports a week apart do not collide', () => {
    expect(exportFileName(new Date('2026-08-28T11:00:00Z'))).toBe('rim-volunteers-2026-08-28.xlsx')
  })
})

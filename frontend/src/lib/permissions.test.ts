import { describe, expect, it } from 'vitest'
import {
  type PermissionGrant,
  grantableCapabilities,
  grantIsValid,
  grantedBy,
  changesBetween,
  decide,
  defaultsOver,
  overridesFrom,
  reachOf,
  teamChangesBetween,
  teamOverridesFrom,
  teamReaches,
  type Holder,
  type Overrides,
  type TeamOverrides,
} from './permissions'

/*
 * decide() is may() in TypeScript. These cases are the ones 0133's local
 * run checked against the database: each answer here was the database's.
 */

const TEAM_A = 'team-a'
const TEAM_B = 'team-b'

const nobody: Holder = { myId: 'me', owner: false, admin: false, ledTeams: [], memberTeams: [] }
const owner: Holder = { ...nobody, owner: true }
const admin: Holder = { ...nobody, admin: true }
const headOfA: Holder = { ...nobody, ledTeams: [TEAM_A], headTeams: [TEAM_A], assistTeams: [] }
const assistantOfA: Holder = { ...nobody, ledTeams: [TEAM_A], headTeams: [], assistTeams: [TEAM_A] }
const memberOfA: Holder = { ...nobody, memberTeams: [TEAM_A] }

describe('decide(), at the defaults', () => {
  it('reproduces the rota as it was: Admins anywhere, Heads on their own team', () => {
    expect(decide({}, admin, 'rota.assign', { departmentId: TEAM_B })).toBe(true)
    expect(decide({}, headOfA, 'rota.assign', { departmentId: TEAM_A })).toBe(true)
    expect(decide({}, headOfA, 'rota.assign', { departmentId: TEAM_B })).toBe(false)
    expect(decide({}, memberOfA, 'rota.assign', { departmentId: TEAM_A })).toBe(false)
    expect(decide({}, memberOfA, 'rota.assign', { departmentId: TEAM_A, coordinating: true })).toBe(false)
    expect(decide({}, nobody, 'rota.assign', { departmentId: TEAM_A })).toBe(false)
  })

  it('gives the Owner everything, whatever the grid says', () => {
    const closed: Overrides = { 'rota.assign': { admin: 'none' } }
    expect(decide(closed, owner, 'rota.assign', { departmentId: TEAM_A })).toBe(true)
    expect(decide(closed, admin, 'rota.assign', { departmentId: TEAM_A })).toBe(false)
  })

  it('gives nobody anything while signed out', () => {
    expect(decide({}, { ...owner, myId: null }, 'rota.assign')).toBe(false)
  })

  it('lets only the Owner and Admins change the grid', () => {
    expect(decide({}, owner, 'app.permissions')).toBe(true)
    expect(decide({}, admin, 'app.permissions')).toBe(true)
    expect(decide({}, headOfA, 'app.permissions')).toBe(false)
  })
})

describe('decide(), with the church’s changes', () => {
  it('opens a team’s rota to the people on it, and no further', () => {
    const grid: Overrides = { 'rota.assign': { member: 'team' } }
    expect(decide(grid, memberOfA, 'rota.assign', { departmentId: TEAM_A })).toBe(true)
    expect(decide(grid, memberOfA, 'rota.assign', { departmentId: TEAM_B })).toBe(false)
  })

  it('reads a Coordinator’s team as the one they coordinate, at that service', () => {
    const grid: Overrides = { 'rota.assign': { coordinator: 'team' } }
    expect(decide(grid, memberOfA, 'rota.assign', { departmentId: TEAM_A, coordinating: true })).toBe(true)
    expect(decide(grid, memberOfA, 'rota.assign', { departmentId: TEAM_A, coordinating: false })).toBe(false)
  })

  it('widens a Head to every team when the church says Everywhere', () => {
    const grid: Overrides = { 'rota.assign': { head: 'all' } }
    expect(decide(grid, headOfA, 'rota.assign', { departmentId: TEAM_B })).toBe(true)
    expect(decide(grid, headOfA, 'rota.assign')).toBe(true)
  })

  it('takes whichever profile reaches further, for somebody holding two', () => {
    const grid: Overrides = { 'rota.assign': { head: 'none', member: 'team' } }
    const headAndMember: Holder = { ...nobody, ledTeams: [TEAM_A], memberTeams: [TEAM_A] }
    expect(decide(grid, headAndMember, 'rota.assign', { departmentId: TEAM_A })).toBe(true)
    expect(decide(grid, headOfA, 'rota.assign', { departmentId: TEAM_A })).toBe(false)
  })

  it('ignores a choice the catalog no longer offers, as the database does', () => {
    // A Church Member is offered nothing on the rota; a stray row cannot change that.
    const stray = { 'rota.assign': { newcomer: 'all' } } as unknown as Overrides
    expect(reachOf(stray, 'rota.assign', 'newcomer')).toBe('none')
    expect(decide(stray, nobody, 'rota.assign', { departmentId: TEAM_A })).toBe(false)
  })
})

describe('overrides and saving', () => {
  it('reads rows from role_permissions, skipping anything it does not know', () => {
    expect(
      overridesFrom([
        { role_key: 'member', capability: 'rota.assign', reach: 'team' },
        { role_key: 'member', capability: 'rota.nonsense', reach: 'team' },
        { role_key: 'pastor', capability: 'rota.assign', reach: 'team' },
        { role_key: 'head', capability: 'rota.tag', reach: 'sometimes' },
      ]),
    ).toEqual({ 'rota.assign': { member: 'team' } })
  })

  it('sends only the cells whose answer would change', () => {
    const stored: Overrides = { 'rota.assign': { member: 'team' } }
    const next: Overrides = {
      'rota.assign': { member: 'team', head: 'all' },
      // Set to what it already is: nothing to send.
      'rota.tag': { head: 'team' },
    }
    expect(changesBetween(stored, next)).toEqual([{ role: 'head', capability: 'rota.assign', reach: 'all' }])
  })

  it('restores the defaults by sending each changed cell back', () => {
    const stored: Overrides = { 'rota.assign': { member: 'team', admin: 'none' } }
    expect(changesBetween(stored, defaultsOver(stored))).toEqual(
      expect.arrayContaining([
        { role: 'admin', capability: 'rota.assign', reach: 'all' },
        { role: 'member', capability: 'rota.assign', reach: 'none' },
      ]),
    )
    expect(changesBetween(stored, defaultsOver(stored))).toHaveLength(2)
    expect(changesBetween({}, defaultsOver({}))).toEqual([])
  })
})

describe('the Assisting Head, as a profile of its own (0162)', () => {
  it('is given what the Head is given, out of the box', () => {
    expect(decide({}, assistantOfA, 'rota.assign', { departmentId: TEAM_A })).toBe(true)
    expect(decide({}, assistantOfA, 'rota.assign', { departmentId: TEAM_B })).toBe(false)
    expect(decide({}, assistantOfA, 'avail.history', { departmentId: TEAM_A })).toBe(true)
  })

  it('can be set apart from the Head by the church', () => {
    const grid: Overrides = { 'avail.history': { assistant: 'none' } }
    expect(decide(grid, assistantOfA, 'avail.history', { departmentId: TEAM_A })).toBe(false)
    expect(decide(grid, headOfA, 'avail.history', { departmentId: TEAM_A })).toBe(true)
  })

  it('reads a holder that does not say which teams it heads as the Head of every team it leads', () => {
    const old: Holder = { ...nobody, ledTeams: [TEAM_A] }
    expect(decide({}, old, 'rota.assign', { departmentId: TEAM_A })).toBe(true)
  })
})

describe('a team’s own rules (0162)', () => {
  it('reach the team the row belongs to, and no other', () => {
    const teams: TeamOverrides = { [TEAM_A]: { 'avail.edit_others': { member: 'team' } } }
    expect(decide({}, memberOfA, 'avail.edit_others', { departmentId: TEAM_A }, teams)).toBe(true)
    expect(decide({}, { ...nobody, memberTeams: [TEAM_B] }, 'avail.edit_others', { departmentId: TEAM_B }, teams)).toBe(false)
  })

  it('can narrow a team’s Head where the church lets Heads everywhere', () => {
    const church: Overrides = { 'avail.edit_others': { head: 'all' } }
    const teams: TeamOverrides = { [TEAM_A]: { 'avail.edit_others': { head: 'none' } } }
    expect(decide(church, headOfA, 'avail.edit_others', { departmentId: TEAM_A }, teams)).toBe(false)
    expect(decide(church, headOfA, 'avail.edit_others', { departmentId: TEAM_B }, teams)).toBe(true)
    // Nothing to be on a team for: the church's rule.
    expect(decide(church, headOfA, 'avail.edit_others', {}, teams)).toBe(true)
  })

  it('offers a team only what the catalog offers that profile, and never Everywhere', () => {
    expect(teamReaches('avail.edit_others', 'member')).toEqual(['none', 'team'])
    expect(teamReaches('avail.history', 'head')).toEqual(['none', 'own', 'team'])
    expect(teamReaches('avail.edit_others', 'admin')).toEqual([])
    expect(teamReaches('svc.manage', 'head')).toEqual([])
  })

  it('reads rows from department_permissions, skipping anything it does not know', () => {
    expect(
      teamOverridesFrom([
        { department_id: TEAM_A, role_key: 'member', capability: 'avail.edit_others', reach: 'team' },
        { department_id: TEAM_A, role_key: 'member', capability: 'no.such', reach: 'team' },
        { department_id: TEAM_B, role_key: 'assistant', capability: 'avail.history', reach: 'own' },
      ]),
    ).toEqual({ [TEAM_A]: { 'avail.edit_others': { member: 'team' } }, [TEAM_B]: { 'avail.history': { assistant: 'own' } } })
  })

  it('sends only the team cells that would change, and a cell given back as null', () => {
    const stored: TeamOverrides = { [TEAM_A]: { 'avail.edit_others': { member: 'team' } } }
    const next: TeamOverrides = { [TEAM_A]: { 'avail.edit_others': {}, 'avail.history': { head: 'none' } } }
    expect(teamChangesBetween(stored, next)).toEqual([
      { role: 'member', capability: 'avail.edit_others', reach: null, department: TEAM_A },
      { role: 'head', capability: 'avail.history', reach: 'none', department: TEAM_A },
    ])
  })
})

/*
 * One thing more (0208), as may() asks it: after every rule the grid has,
 * for a person by name or everybody on a team, on their teams or everywhere.
 * Proved on production against may() with grants added at random; these
 * hold the mirror to the same rule.
 */
describe('a grant', () => {
  const asha = (grants: PermissionGrant[], over: Partial<Holder> = {}): Holder => ({
    myId: 'asha',
    owner: false,
    admin: false,
    ledTeams: [],
    memberTeams: ['worship'],
    grants,
    ...over,
  })
  const byName = (reach: 'team' | 'all'): PermissionGrant => ({ capability: 'rota.assign', userId: 'asha', departmentId: null, reach })
  const toTeam = (team: string, reach: 'team' | 'all'): PermissionGrant => ({ capability: 'rota.assign', userId: null, departmentId: team, reach })

  it('gives nothing when there is none: a Team Member may not assign the rota', () => {
    expect(decide({}, asha([]), 'rota.assign', { departmentId: 'worship' })).toBe(false)
  })

  it('by name, everywhere: on any team and on none', () => {
    const holder = asha([byName('all')])
    expect(grantedBy({}, holder, 'rota.assign', { departmentId: 'media' })).toBe('grant')
    expect(decide({}, holder, 'rota.assign', { departmentId: null })).toBe(true)
  })

  it('by name, on their teams: on a team they are on or lead, and on what is theirs, nowhere else', () => {
    const holder = asha([byName('team')], { ledTeams: ['welcome'] })
    expect(decide({}, holder, 'rota.assign', { departmentId: 'worship' })).toBe(true)
    expect(decide({}, holder, 'rota.assign', { departmentId: 'welcome' })).toBe(true)
    expect(decide({}, holder, 'rota.assign', { departmentId: 'media' })).toBe(false)
    expect(decide({}, holder, 'rota.assign', { departmentId: null })).toBe(false)
    expect(decide({}, holder, 'rota.assign', { ownerId: 'asha' })).toBe(true)
  })

  it('to a team: its people, on that team — or everywhere when it says so', () => {
    expect(decide({}, asha([toTeam('worship', 'team')]), 'rota.assign', { departmentId: 'worship' })).toBe(true)
    expect(decide({}, asha([toTeam('worship', 'team')]), 'rota.assign', { departmentId: 'media' })).toBe(false)
    expect(decide({}, asha([toTeam('worship', 'all')]), 'rota.assign', { departmentId: 'media' })).toBe(true)
    // Nobody off the team is carried by it.
    expect(decide({}, asha([toTeam('media', 'all')]), 'rota.assign', { departmentId: 'media' })).toBe(false)
    // A Head of the team is on it, as the rooms' lists always meant.
    expect(decide({}, asha([toTeam('media', 'team')], { memberTeams: [], ledTeams: ['media'] }), 'rota.assign', { departmentId: 'media' })).toBe(true)
  })

  it('to a team’s Heads alone: its Head and Assisting Heads, not its roster (0213)', () => {
    const headsOnly: PermissionGrant = { ...toTeam('worship', 'all'), leadsOnly: true }
    expect(decide({}, asha([headsOnly]), 'rota.assign', { departmentId: 'media' })).toBe(false)
    expect(decide({}, asha([headsOnly], { ledTeams: ['worship'] }), 'rota.assign', { departmentId: 'media' })).toBe(true)
  })

  it('is for its own capability only, and never takes a yes away', () => {
    expect(decide({}, asha([byName('all')]), 'rota.tag', { departmentId: 'worship' })).toBe(false)
    const head: Holder = { ...asha([]), ledTeams: ['worship'], headTeams: ['worship'] }
    expect(grantedBy({}, head, 'rota.assign', { departmentId: 'worship' })).toBe('head')
  })

  it('may be given only what the grid could give a profile other than Admin', () => {
    expect(grantIsValid('rota.assign', 'all')).toBe(true)
    expect(grantIsValid('rota.assign', 'team')).toBe(true)
    expect(grantIsValid('app.permissions', 'all')).toBe(false)
    expect(grantableCapabilities().some((cap) => cap.startsWith('app.'))).toBe(false)
    expect(grantableCapabilities()).toContain('set.edit')
  })
})

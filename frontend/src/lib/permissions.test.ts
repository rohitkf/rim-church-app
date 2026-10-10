import { describe, expect, it } from 'vitest'
import {
  changesBetween,
  decide,
  defaultsOver,
  overridesFrom,
  reachOf,
  type Holder,
  type Overrides,
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
const headOfA: Holder = { ...nobody, ledTeams: [TEAM_A] }
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

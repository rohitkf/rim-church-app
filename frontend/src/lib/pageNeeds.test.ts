import { describe, expect, it } from 'vitest'
import { pageNeeds } from './pageNeeds'
import type { Overrides, PermissionChange } from './permissions'

const give = (role: PermissionChange['role'], capability: PermissionChange['capability'], reach: PermissionChange['reach'] = 'all'): PermissionChange => ({ role, capability, reach })
const after = (changes: PermissionChange[], base: Overrides = {}): Overrides => {
  const grid: Overrides = { ...base }
  for (const c of changes) if (c.reach) grid[c.capability] = { ...grid[c.capability], [c.role]: c.reach }
  return grid
}
const needs = (changes: PermissionChange[], base: Overrides = {}) => pageNeeds(changes, after(changes, base))

describe('a right somebody could not reach', () => {
  it('says a Pastor given a rota right cannot open the Team Rota, and names the cell that would open it', () => {
    expect(needs([give('pastor', 'rota.assign')])).toEqual([
      { role: 'pastor', capability: 'rota.assign', page: '/rota', pageName: 'Team Rota', opener: 'page.rota' },
    ])
  })

  it('is satisfied once the page is opened in the same save', () => {
    expect(needs([give('pastor', 'rota.assign'), give('pastor', 'page.rota')])).toEqual([])
    // Or when the page is open to every Church Member, which a Pastor is.
    expect(needs([give('pastor', 'rota.assign')], { 'page.rota': { newcomer: 'all' } })).toEqual([])
  })

  it('asks nothing where the page is already open to the role', () => {
    // The Service Planner is open to everybody out of the box.
    expect(needs([give('newcomer', 'svc.manage')])).toEqual([])
    // A Team Member opens the Team Rota.
    expect(needs([give('member', 'rota.assign')])).toEqual([])
    // Registrations opens by its own rights.
    expect(needs([give('pastor', 'reg.manage')])).toEqual([])
  })

  it('says so, with no cell to offer, where the role has none on the page', () => {
    // Availability needs a team: a Church Member has no cell to open it by.
    expect(needs([give('newcomer', 'avail.nudge')])).toEqual([
      { role: 'newcomer', capability: 'avail.nudge', page: '/availability', pageName: 'Availability', opener: null },
    ])
  })

  it('offers the page’s own row where the page has a choice (0277)', () => {
    expect(needs([give('pastor', 'people.remove')])[0]).toMatchObject({ page: '/volunteers', opener: 'page.volunteers' })
  })

  it('offers "See every clock-in" as what opens Clock In', () => {
    expect(needs([give('pastor', 'clockin.approve')])).toEqual([
      { role: 'pastor', capability: 'clockin.approve', page: '/clock-in', pageName: 'Clock In', opener: 'clockin.view' },
    ])
    expect(needs([give('pastor', 'clockin.approve'), give('pastor', 'clockin.view')])).toEqual([])
  })

  it('asks only about a right being given, church-wide, to a role a page can be closed to', () => {
    expect(needs([give('pastor', 'rota.assign', 'none')])).toEqual([])
    expect(needs([{ ...give('member', 'inv.items', 'team'), department: 'd1' }])).toEqual([])
    for (const role of ['admin', 'head', 'assistant', 'coordinator', 'overwatch'] as const) expect(needs([give(role, 'rota.assign')]), role).toEqual([])
  })

  it('names a page once for a role, however many rights on it are given', () => {
    expect(needs([give('pastor', 'rota.assign'), give('pastor', 'rota.tag')])).toHaveLength(1)
  })
})

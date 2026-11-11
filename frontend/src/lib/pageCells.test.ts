import { describe, expect, it } from 'vitest'
import { PAGE_RULES } from './pageAccess'
import { PAGE_CAPABILITIES, cellsForLevel, levelFromCells, levelsFrom, pageCapability } from './pageCells'
import { reachOf, ruleFor, type Overrides } from './permissions'

/*
 * A page's level is two cells in the grid (0215): a Church Member's and a
 * Team Member's. Every level a page offers is a pair of them, and every
 * pair a level, so Page by Page can keep offering levels.
 */

describe('who may open a page, as cells', () => {
  it('names a capability for every page with a choice, and none for one that opens another way', () => {
    const keyed = Object.values(PAGE_RULES).filter((r) => r.key).map((r) => r.key)
    expect(PAGE_CAPABILITIES.map((p) => p.key)).toEqual(keyed)
    expect(pageCapability('/service-planner/abc')).toBe('page.service_planner')
    expect(pageCapability('set-lists')).toBe('page.set_lists')
    // Volunteers, Availability, Checklists, Team Chat and Songs have a choice since 0277.
    expect(pageCapability('/volunteers')).toBe('page.volunteers')
    expect(pageCapability('/team-chat')).toBe('page.team_chat')
    // The Dashboard is where everybody lands; Clock In and Feedback open by a row of their own.
    expect(pageCapability('/')).toBeNull()
    expect(pageCapability('/clock-in')).toBeNull()
    expect(pageCapability('/feedback')).toBeNull()
  })

  it('starts every page at its default level', () => {
    for (const { path, key } of PAGE_CAPABILITIES) expect(levelsFrom({})[key], path).toBe(PAGE_RULES[path].default)
  })

  it('offers each page exactly the levels Page by Page offers, and reads each back', () => {
    for (const { path, capability } of PAGE_CAPABILITIES) {
      for (const level of PAGE_RULES[path].choices) {
        const overrides: Overrides = {}
        for (const { role, reach } of cellsForLevel(capability, level)) {
          expect(ruleFor(capability, role).reaches, `${path} ${level} ${role}`).toContain(reach)
          overrides[capability] = { ...overrides[capability], [role]: reach }
        }
        expect(levelFromCells(overrides, capability), `${path} ${level}`).toBe(level)
      }
    }
  })

  it('lets every page be kept to the Heads, the Admins or the Owner (0274, 0277)', () => {
    for (const { path, capability } of PAGE_CAPABILITIES) {
      // Every rung a choice, starting where the page's default level puts it.
      const startsWithAdmins = PAGE_RULES[path].default === 'admins'
      expect(ruleFor(capability, 'admin'), capability).toEqual({ reaches: ['none', 'all'], byDefault: 'all' })
      for (const role of ['head', 'assistant', 'member'] as const) {
        expect(ruleFor(capability, role), `${capability} ${role}`).toEqual({ reaches: ['none', 'all'], byDefault: startsWithAdmins ? 'none' : 'all' })
      }
      // A Team Coordinator opens a page as the Team Member they are: no cell.
      expect(ruleFor(capability, 'coordinator').reaches).toEqual(['none'])
      for (const level of ['leads', 'admins', 'owner'] as const) expect(PAGE_RULES[path].choices, path).toContain(level)
    }
    // The four a Team Member always opened are no exception any more.
    expect(ruleFor('page.rota', 'admin').reaches).toEqual(['none', 'all'])
    expect(PAGE_RULES['/volunteers'].default).toBe('admins')
  })

  it('reads the two new levels from the cells, and writes the whole ladder for a level (0274)', () => {
    const cap = 'page.inventory' as const
    const cellsOf = (level: Parameters<typeof cellsForLevel>[1]) =>
      Object.fromEntries(cellsForLevel(cap, level).map((c) => [c.role, c.reach]))
    expect(cellsOf('admins')).toEqual({ member: 'none', head: 'none', assistant: 'none', admin: 'all' })
    expect(cellsOf('owner')).toEqual({ member: 'none', head: 'none', assistant: 'none', admin: 'none' })
    // Opening it again opens it to its Heads and Admins too.
    expect(cellsOf('team')).toEqual({ member: 'all', head: 'all', assistant: 'all', admin: 'all' })
    expect(levelFromCells({ [cap]: cellsOf('admins') }, cap)).toBe('admins')
    expect(levelFromCells({ [cap]: cellsOf('owner') }, cap)).toBe('owner')
    expect(levelFromCells({ [cap]: cellsOf('leads') }, cap)).toBe('leads')
  })

  it('never offers a cell a page cannot honour', () => {
    // A page that needs a team to mean anything cannot open to Church Members.
    for (const cap of ['page.debriefs', 'page.inventory', 'page.availability', 'page.checklists', 'page.team_chat', 'page.volunteers'] as const) {
      expect(ruleFor(cap, 'newcomer').reaches, cap).toEqual(['none'])
      expect(reachOf({ [cap]: { newcomer: 'all' } } as Overrides, cap, 'newcomer'), cap).toBe('none')
    }
    // The Rota can be kept from Team Members since 0277; a level sets every rung it offers.
    expect(reachOf({ 'page.rota': { member: 'none' } }, 'page.rota', 'member')).toBe('none')
    expect(cellsForLevel('page.rota', 'everyone')).toEqual([
      { role: 'newcomer', reach: 'all' },
      { role: 'member', reach: 'all' },
      { role: 'head', reach: 'all' },
      { role: 'assistant', reach: 'all' },
      { role: 'admin', reach: 'all' },
    ])
  })
})

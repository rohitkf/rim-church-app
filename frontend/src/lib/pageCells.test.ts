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
  it('names a capability for every page with a choice, and none for a fixed one', () => {
    const keyed = Object.values(PAGE_RULES).filter((r) => r.key).map((r) => r.key)
    expect(PAGE_CAPABILITIES.map((p) => p.key)).toEqual(keyed)
    expect(pageCapability('/service-planner/abc')).toBe('page.service_planner')
    expect(pageCapability('set-lists')).toBe('page.set_lists')
    expect(pageCapability('/volunteers')).toBeNull()
    expect(pageCapability('/')).toBeNull()
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

  it('lets a page be kept to the Admins or the Owner exactly where it can be kept to Heads (0274)', () => {
    for (const { capability } of PAGE_CAPABILITIES) {
      const toHeads = ruleFor(capability, 'member').reaches.length > 1
      for (const role of ['admin', 'head', 'assistant'] as const) {
        // A choice that starts at Yes, or — where a Team Member always opens it — fixed at Yes.
        expect(ruleFor(capability, role).reaches, `${capability} ${role}`).toEqual(toHeads ? ['none', 'all'] : ['all'])
        expect(ruleFor(capability, role).byDefault).toBe('all')
      }
      expect(ruleFor(capability, 'coordinator').reaches).toEqual(['none'])
    }
    expect(ruleFor('page.rota', 'admin').reaches).toEqual(['all'])
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
    // The Rota cannot be kept from Team Members; Debriefs cannot open to Church Members.
    expect(ruleFor('page.rota', 'member').reaches).toEqual(['all'])
    expect(ruleFor('page.debriefs', 'newcomer').reaches).toEqual(['none'])
    expect(cellsForLevel('page.rota', 'everyone')).toEqual([{ role: 'newcomer', reach: 'all' }])
    expect(reachOf({ 'page.rota': { member: 'none' } }, 'page.rota', 'member')).toBe('all')
  })
})

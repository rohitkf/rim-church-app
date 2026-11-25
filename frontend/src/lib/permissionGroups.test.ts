import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from './permissionMatrix'
import { blockableCapabilities, grantableCapabilities, grantIsValid } from './permissions'
import { groupCapabilities, oneWayOnly, reachFor, searchGroups } from './permissionGroups'

/*
 * The rights, sorted for choosing from (components/PermissionPicker):
 * under the area each belongs to, in the grid's own order, found by a
 * word of theirs or of their area.
 */

describe('the rights under their areas', () => {
  const groups = groupCapabilities(grantableCapabilities())

  it('offers every right that can be given, each once', () => {
    const keys = groups.flatMap((g) => g.rows.map((r) => r.key))
    expect([...keys].sort()).toEqual([...grantableCapabilities()].sort())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('files each under an area the grid has, in the grid’s order, and leaves out the empty ones', () => {
    const order = PERMISSIONS.map((a) => a.area)
    const areas = groups.map((g) => g.area)
    expect(areas.every((a) => order.includes(a))).toBe(true)
    expect(areas).toEqual([...areas].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    expect(groups.every((g) => g.rows.length > 0)).toBe(true)
  })

  it('says a right in a few words where the grid has them, with the sentence under it, and never says it twice', () => {
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(row.short.length).toBeGreaterThan(0)
      expect(row.action).not.toBe(row.short)
    }
    const assign = groups.flatMap((g) => g.rows).find((r) => r.key === 'rota.assign')!
    expect(assign.action || assign.short).toBe('Assign somebody to a role')
  })

  it('offers only what it is handed: a page is not blocked by name', () => {
    const blockable = groupCapabilities(blockableCapabilities())
    expect(blockable.flatMap((g) => g.rows).some((r) => r.key.startsWith('page.'))).toBe(false)
  })
})

describe('finding one', () => {
  const groups = groupCapabilities(grantableCapabilities())

  it('finds by any words of the right, in any order', () => {
    const found = searchGroups(groups, 'role assign')
    expect(found.flatMap((g) => g.rows).some((r) => r.key === 'rota.assign')).toBe(true)
  })

  it('finds a whole area by its name', () => {
    const found = searchGroups(groups, 'team rota')
    const rota = groups.find((g) => g.area === 'Team rota')!
    expect(found.find((g) => g.area === 'Team rota')?.rows).toEqual(rota.rows)
  })

  it('hands back everything for nothing typed, and nothing for nonsense', () => {
    expect(searchGroups(groups, '  ')).toEqual(groups)
    expect(searchGroups(groups, 'zzzqqq')).toEqual([])
  })
})

describe('how far, for several at once', () => {
  const words = { team: 'On their teams', all: 'Everywhere' }

  it('gives a right as asked where it can be, and the one way it can where it cannot', () => {
    for (const cap of grantableCapabilities()) {
      for (const wanted of ['team', 'all'] as const) {
        expect(grantIsValid(cap, reachFor(cap, wanted)), `${cap} ${wanted}`).toBe(true)
        if (grantIsValid(cap, wanted)) expect(reachFor(cap, wanted)).toBe(wanted)
      }
    }
  })

  it('says so beside a right that goes one way only, and nothing beside one that goes both', () => {
    expect(oneWayOnly('rota.assign', words)).toBeNull()
    expect(oneWayOnly('settings.logo', words)).toBe('Everywhere only')
  })
})

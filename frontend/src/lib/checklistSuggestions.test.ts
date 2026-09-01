import { describe, expect, it } from 'vitest'
import { suggestChecklistItems } from './checklistSuggestions'
import type { ChecklistPhase, RoleChecklistItem } from './types'

let n = 0
function item(role: string, label: string, phase: ChecklistPhase = 'pre'): RoleChecklistItem {
  n += 1
  return { id: `i${n}`, role_id: role, department_id: 'd1', label, sort_order: n, phase }
}

const roleNames = new Map([
  ['cam1', 'Camera Operator 1'],
  ['cam2', 'Camera Operator 2'],
  ['cam3', 'Camera Operator 3'],
  ['dir', 'Director'],
])

const ask = (over: Partial<Parameters<typeof suggestChecklistItems>[0]> = {}) =>
  suggestChecklistItems({
    items: [],
    roleNames,
    roleId: 'cam1',
    phase: 'pre',
    query: 'bat',
    ...over,
  })

describe('suggestChecklistItems', () => {
  it('offers what another role on the team already has', () => {
    const found = ask({ items: [item('cam2', 'Check batteries')] })
    expect(found).toEqual([{ label: 'Check batteries', usedBy: ['Camera Operator 2'] }])
  })

  it('says nothing until something is typed', () => {
    expect(ask({ items: [item('cam2', 'Check batteries')], query: '   ' })).toEqual([])
  })

  it('does not offer what this role already has', () => {
    const found = ask({
      items: [item('cam1', 'check batteries '), item('cam2', 'Check batteries')],
    })
    expect(found).toEqual([])
  })

  it('counts one wording once, and names every role using it', () => {
    const found = ask({
      items: [item('cam2', 'Check batteries'), item('cam3', 'Check batteries')],
    })
    expect(found).toHaveLength(1)
    expect(found[0].usedBy).toEqual(['Camera Operator 2', 'Camera Operator 3'])
  })

  it('keeps the phases apart', () => {
    // Charging batteries afterwards is not checking them beforehand, and
    // offering one for the other is the app guessing.
    const found = ask({ items: [item('cam2', 'Batteries on charge', 'post')] })
    expect(found).toEqual([])
    expect(ask({ items: [item('cam2', 'Batteries on charge', 'post')], phase: 'post' })).toHaveLength(1)
  })

  it('matches in the middle of a line, not only at its start', () => {
    const found = ask({ items: [item('dir', 'Spare batteries in the bag')] })
    expect(found[0].label).toBe('Spare batteries in the bag')
  })

  it('puts what starts with the typed text first', () => {
    const found = ask({
      items: [item('dir', 'Spare batteries in the bag'), item('cam2', 'Batteries tested')],
    })
    expect(found.map((f) => f.label)).toEqual(['Batteries tested', 'Spare batteries in the bag'])
  })

  it('then prefers the wording more roles already use', () => {
    const found = ask({
      items: [
        item('cam2', 'Battery check'),
        item('cam3', 'Battery swap'),
        item('dir', 'Battery swap'),
      ],
    })
    expect(found.map((f) => f.label)).toEqual(['Battery swap', 'Battery check'])
  })

  it('ignores case when matching', () => {
    expect(ask({ items: [item('cam2', 'CHECK BATTERIES')], query: 'BaT' })).toHaveLength(1)
  })

  it('offers a handful, not a catalogue', () => {
    const items = Array.from({ length: 12 }, (_, i) => item('cam2', `Battery job ${i}`))
    expect(ask({ items })).toHaveLength(5)
    expect(ask({ items, limit: 2 })).toHaveLength(2)
  })
})

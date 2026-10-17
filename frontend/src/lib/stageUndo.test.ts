import { describe, expect, it } from 'vitest'
import { describeChange, inverseOf, isEmptyPatch, resolveId, snapshotOf } from './stageUndo'
import type { StageBlock } from './stage'

const block = (over: Partial<StageBlock> = {}): StageBlock => ({
  id: 'b1', layout_id: 'L1', area_id: 'A', label: 'Keyboard', person_id: 'p1', color: '#0A84FF',
  x: 100, y: 100, w: 160, h: 100, rotation: 0, z: 1, kind: 'block', seats: 0, corners: 'sharp', icon: null,
  locked_by: null, locked_at: null, placed_by: 'u1', placed_at: 'x', updated_by: 'u1', updated_at: 'x',
  ...over,
})

describe('undo on the stage', () => {
  it('puts back only what a change overwrites', () => {
    expect(inverseOf(block(), { x: 300, y: 100, w: 160, h: 100, area_id: 'A' })).toEqual({ x: 100 })
    expect(inverseOf(block(), { x: 300, y: 50, area_id: 'B' })).toEqual({ x: 100, y: 100, area_id: 'A' })
    expect(inverseOf(block(), { person_id: null, color: '#FF9F0A' })).toEqual({ person_id: 'p1', color: '#0A84FF' })
    expect(isEmptyPatch(inverseOf(block(), { x: 100 }))).toBe(true)
  })

  it('keeps a removed block whole, without its id, lock or stamps', () => {
    const snap = snapshotOf(block({ locked_at: 'x', locked_by: 'u2', kind: 'item', icon: 'camera', corners: 'rounded' }))
    expect(snap).toEqual({
      area_id: 'A', label: 'Keyboard', person_id: 'p1', color: '#0A84FF', x: 100, y: 100, w: 160, h: 100,
      rotation: 0, z: 1, kind: 'item', seats: 0, corners: 'rounded', icon: 'camera',
    })
    expect(snap).not.toHaveProperty('id')
    expect(snap).not.toHaveProperty('locked_at')
  })

  it('names each step the way the button says it', () => {
    expect(describeChange('Keyboard', { x: 1, y: 2, w: 3, h: 4, area_id: 'A' })).toBe('move Keyboard')
    expect(describeChange('Keyboard', { w: 3, h: 4 })).toBe('resize Keyboard')
    expect(describeChange('Drums', { color: '#fff' })).toBe('recolour Drums')
    expect(describeChange('Drums', { z: 9 })).toBe('bring to front Drums')
  })

  it('follows a block through every time it was put back', () => {
    const aliases = new Map([['b1', 'b2'], ['b2', 'b3']])
    expect(resolveId(aliases, 'b1')).toBe('b3')
    expect(resolveId(aliases, 'b9')).toBe('b9')
  })
})

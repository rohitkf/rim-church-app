import { describe, expect, it } from 'vitest'
import {
  REGION_GAP,
  alignBlock,
  clampBlock,
  duplicateOf,
  regionAt,
  regionsOf,
  workspaceOf,
  fitScale,
  inkOn,
  logSentence,
  placeNewBlock,
  snap,
  stageMay,
  type StageLogLine,
} from './stage'

const stage = { width: 1200, height: 700 }

describe('keeping a block on the stage', () => {
  it('never lets a block hang off an edge', () => {
    expect(clampBlock({ x: -20, y: -5, w: 160, h: 100 }, stage)).toEqual({ x: 0, y: 0, w: 160, h: 100 })
    expect(clampBlock({ x: 1150, y: 680, w: 160, h: 100 }, stage)).toEqual({ x: 1040, y: 600, w: 160, h: 100 })
  })
  it('keeps a block big enough to read and no bigger than the stage', () => {
    expect(clampBlock({ x: 0, y: 0, w: 5, h: 5 }, stage)).toEqual({ x: 0, y: 0, w: 40, h: 40 })
    expect(clampBlock({ x: 0, y: 0, w: 9000, h: 100 }, stage).w).toBe(1200)
  })
  it('snaps to the grid, which is the dots', () => {
    expect(snap(9)).toBe(0)
    expect(snap(11)).toBe(20)
    expect(snap(30)).toBe(40)
    expect(snap(49)).toBe(40)
  })
})

describe('where a new block lands', () => {
  it('takes the first free spot, reading left to right', () => {
    expect(placeNewBlock([], stage)).toEqual({ x: 40, y: 40 })
    const taken = [{ x: 40, y: 40, w: 160, h: 100 }]
    const next = placeNewBlock(taken, stage)
    expect(next.y).toBe(40)
    expect(next.x).toBeGreaterThanOrEqual(200)
  })
})

describe('fitting the stage in its box', () => {
  it('scales to the tighter side, with a margin', () => {
    expect(fitScale(stage, { width: 1224, height: 2000 })).toBeCloseTo(1, 2)
    expect(fitScale(stage, { width: 360, height: 400 })).toBeCloseTo(336 / 1200, 2)
  })
  it('never zooms past readable or to nothing', () => {
    expect(fitScale(stage, { width: 0, height: 0 })).toBe(0.1)
    expect(fitScale({ width: 400, height: 300 }, { width: 4000, height: 4000 })).toBe(2)
  })
})

describe('who may', () => {
  const access = [{ department_id: 'd1', can_add: true, can_edit: true, can_delete: false, can_comment: true, can_templates: false }]
  it('is always yes for an Admin', () => {
    expect(stageMay('delete', { isAdmin: true, teamIds: [] }, access)).toBe(true)
  })
  it('follows the team’s ticks for everybody else', () => {
    const me = { isAdmin: false, teamIds: ['d1'] }
    expect(stageMay('add', me, access)).toBe(true)
    expect(stageMay('delete', me, access)).toBe(false)
    expect(stageMay('templates', me, access)).toBe(false)
    expect(stageMay('add', { isAdmin: false, teamIds: ['d2'] }, access)).toBe(false)
  })
})

describe('the log, said as a sentence', () => {
  const line = (over: Partial<StageLogLine>): StageLogLine => ({
    id: 'l', layout_id: 'x', block_id: 'b', block_label: 'Keyboard', kind: 'added', detail: {}, by: 'u', at: '2026-10-17T10:00:00Z',
    actor: { id: 'u', first_name: 'Rohit', last_name: 'K' },
    ...over,
  })
  it('names who did what to which block', () => {
    expect(logSentence(line({}))).toBe('Rohit K added Keyboard')
    expect(logSentence(line({ kind: 'moved' }))).toBe('Rohit K moved Keyboard')
    expect(logSentence(line({ kind: 'renamed', block_label: 'Keys', detail: { was: 'Keyboard' } }))).toBe('Rohit K renamed Keyboard to Keys')
    expect(logSentence(line({ kind: 'assigned', detail: { person: 'p' } }))).toBe('Rohit K put somebody on Keyboard')
    expect(logSentence(line({ kind: 'assigned', detail: { person: null } }))).toBe('Rohit K took the person off Keyboard')
    expect(logSentence(line({ kind: 'commented', block_id: null, block_label: null }))).toBe('Rohit K commented')
    expect(logSentence(line({ kind: 'template_applied', block_id: null, block_label: null, detail: { name: 'Full band' } }))).toBe('Rohit K applied the template Full band')
    expect(logSentence(line({ kind: 'cleared', block_label: null }))).toBe('Rohit K cleared the stage')
    expect(logSentence(line({ kind: 'locked' }))).toBe('Rohit K locked Keyboard')
    expect(logSentence(line({ kind: 'move_requested', detail: { note: 'Camera' } }))).toBe('Rohit K asked to move Keyboard — “Camera”')
    expect(logSentence(line({ kind: 'move_declined' }))).toBe('Rohit K declined a move of Keyboard')
  })
  it('says Somebody when the account has gone', () => {
    expect(logSentence(line({ actor: null, kind: 'deleted' }))).toBe('Somebody removed Keyboard')
  })
})

describe('ink on a colour', () => {
  it('is dark on a light block and light on a dark one', () => {
    expect(inkOn('#FFD60A')).toBe('#0b0b0f')
    expect(inkOn('#5E5CE6')).toBe('#ffffff')
  })
})

describe('the workspace', () => {
  const areas = [
    { id: 'B', name: 'Audience', width: 1200, height: 900, top_label: 'Stage', bottom_label: 'Back of hall', position: 1 },
    { id: 'A', name: 'Stage', width: 1000, height: 700, top_label: 'Back', bottom_label: 'Front', position: 0 },
  ]
  it('stacks the areas top to bottom in their set order, a gap between', () => {
    const regions = regionsOf(areas)
    expect(regions.map((r) => r.area.name)).toEqual(['Stage', 'Audience'])
    expect(regions[0].top).toBe(0)
    expect(regions[1].top).toBe(700 + REGION_GAP)
    expect(workspaceOf(regions)).toEqual({ width: 1200, height: 700 + REGION_GAP + 900 })
  })
  it('says which region a point is in, and the nearest for a point in the gap', () => {
    const regions = regionsOf(areas)
    expect(regionAt(regions, 10, 10)?.area.name).toBe('Stage')
    expect(regionAt(regions, 10, 1000)?.area.name).toBe('Audience')
    expect(regionAt(regions, 10, 705)?.area.name).toBe('Stage')
    expect(regionAt([], 1, 1)).toBeNull()
  })
})

describe('a copy of a block', () => {
  const source = { area_id: 'A', label: 'Monitor', color: '#8E8E93', x: 1100, y: 650, w: 160, h: 100, rotation: 90, kind: 'block' as const, seats: 0, corners: 'rounded' as const, icon: null }
  it('lands a step down and right, inside its region, as the top block', () => {
    const copy = duplicateOf({ ...source, x: 100, y: 100 }, { width: 1200, height: 700 }, 7)
    expect(copy).toMatchObject({ area_id: 'A', label: 'Monitor', color: '#8E8E93', x: 140, y: 140, w: 160, h: 100, rotation: 90, z: 7 })
  })
  it('is held inside the region when the original sits at the edge', () => {
    const copy = duplicateOf(source, { width: 1200, height: 700 }, 1)
    expect(copy.x + copy.w).toBeLessThanOrEqual(1200)
    expect(copy.y + copy.h).toBeLessThanOrEqual(700)
  })
  it('keeps its corners, and the picture of an item', () => {
    expect(duplicateOf({ ...source, x: 100, y: 100 }, { width: 1200, height: 700 }, 1)).toMatchObject({ corners: 'rounded', icon: null })
    expect(duplicateOf({ ...source, x: 100, y: 100, kind: 'item', icon: 'camera' }, { width: 1200, height: 700 }, 1)).toMatchObject({ kind: 'item', icon: 'camera' })
  })
  it('keeps the seats of a row', () => {
    expect(duplicateOf({ ...source, kind: 'seats', seats: 12 }, { width: 1200, height: 700 }, 1)).toMatchObject({ kind: 'seats', seats: 12 })
  })
})

describe('smart guides', () => {
  const region = { width: 1200, height: 700 }
  const other = { x: 400, y: 300, w: 160, h: 100 }

  it('pulls a near edge onto a neighbour’s edge, and draws the line between them', () => {
    const r = alignBlock({ x: 390, y: 100, w: 160, h: 100 }, [other], region, 16)
    expect(r.x).toBe(400)
    expect(r.y).toBe(100)
    expect(r.guides).toEqual([{ axis: 'x', at: 400, from: 100, to: 400 }])
  })

  it('lines up centres too', () => {
    // A wide neighbour whose centre (310) is the only line within reach of the block's centre (300).
    const r = alignBlock({ x: 250, y: 100, w: 100, h: 100 }, [{ x: 200, y: 400, w: 220, h: 20 }], region, 16)
    expect(r.x).toBe(260)
    expect(r.guides).toEqual([{ axis: 'x', at: 310, from: 100, to: 420 }])
  })

  it('leaves a block alone when nothing is within reach', () => {
    const r = alignBlock({ x: 370, y: 100, w: 160, h: 100 }, [other], region, 16)
    expect(r).toEqual({ x: 370, y: 100, w: 160, h: 100, guides: [] })
  })

  it('offers the region’s own centre lines', () => {
    const r = alignBlock({ x: 515, y: 290, w: 160, h: 100 }, [], region, 16)
    expect(r.x).toBe(520)
    expect(r.y).toBe(300)
    expect(r.guides.map((g) => [g.axis, g.at])).toEqual([['x', 600], ['y', 350]])
  })

  it('on a resize grows the far edge to meet a neighbour, without sliding', () => {
    const r = alignBlock({ x: 100, y: 100, w: 290, h: 100 }, [other], region, 16, 'resize')
    expect(r).toMatchObject({ x: 100, y: 100, w: 300, h: 100 })
    expect(r.guides).toEqual([{ axis: 'x', at: 400, from: 100, to: 400 }])
  })
})

import { describe, expect, it } from 'vitest'
import {
  REGION_GAP,
  clampBlock,
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
  it('snaps to the grid', () => {
    expect(snap(14)).toBe(10)
    expect(snap(16)).toBe(20)
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

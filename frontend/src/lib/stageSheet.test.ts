import { describe, expect, it } from 'vitest'
import { LANDSCAPE, stageSheetPage, type StageSheet } from './stageSheet'

const sheet: StageSheet = {
  title: 'English Service',
  subtitle: 'Sunday, 19 October 2026',
  regions: [
    { name: 'Stage', top: 0, left: 0, width: 1200, height: 700, topLabel: 'Back of stage', bottomLabel: 'Front · congregation' },
    { name: 'Audience', top: 760, left: 0, width: 1200, height: 900, topLabel: 'Stage', bottomLabel: 'Back of hall' },
  ],
  blocks: [
    { area_id: 'Stage', label: 'Keyboard', person: 'Blessy T', color: '#0A84FF', x: 0, y: 0, w: 200, h: 120, rotation: 0, kind: 'block', seats: 0, corners: 'sharp', icon: null },
    { area_id: 'Stage', label: 'Drums', person: null, color: '#FF9F0A', x: 1000, y: 580, w: 200, h: 120, rotation: 0, kind: 'block', seats: 0, corners: 'sharp', icon: null },
    { area_id: 'Audience', label: 'Row A', person: null, color: '#5E5CE6', x: 100, y: 300, w: 600, h: 60, rotation: 0, kind: 'seats', seats: 12, corners: 'rounded', icon: null },
  ],
  footer: '3 blocks · exported today',
}

describe('a stage as a sheet', () => {
  it('stands the page up for a stage over a hall, and lies it down for a stage alone', () => {
    const page = stageSheetPage(sheet, 'dark')
    expect(page.height).toBeGreaterThan(page.width)
    const alone = stageSheetPage({ ...sheet, regions: [sheet.regions[0]] }, 'dark')
    expect(alone.width).toBe(LANDSCAPE.width)
    const words = page.texts.map((t) => t.text)
    expect(words).toContain('English Service')
    expect(words).toContain('BACK OF STAGE')
    expect(words).toContain('FRONT · CONGREGATION')
    expect(words).toContain('BACK OF HALL')
    expect(words).toContain('AUDIENCE')
    expect(words).toContain('3 blocks · exported today')
  })

  it('keeps every block in proportion and inside its region, in its own colour', () => {
    const page = stageSheetPage(sheet, 'light')
    const stageRect = page.rects.find((r) => r.color === '#f2f2f7')!
    const keyboard = page.rects.find((r) => r.color === '#0A84FF')!
    const drums = page.rects.find((r) => r.color === '#FF9F0A')!
    expect(keyboard.x).toBeCloseTo(stageRect.x, 5)
    expect(keyboard.y).toBeCloseTo(stageRect.y, 5)
    expect(drums.x + drums.w).toBeCloseTo(stageRect.x + stageRect.w, 5)
    expect(drums.y + drums.h).toBeCloseTo(stageRect.y + stageRect.h, 5)
    expect(keyboard.w / keyboard.h).toBeCloseTo(200 / 120, 2)
    expect(stageRect.w / stageRect.h).toBeCloseTo(1200 / 700, 2)
  })

  it('writes the name and the person on a block, and draws a row of seats as chairs', () => {
    const page = stageSheetPage(sheet, 'dark')
    const words = page.texts.map((t) => t.text)
    expect(words).toContain('Keyboard')
    expect(words).toContain('Blessy T')
    expect(words).toContain('Row A · 12')
    expect(page.circles).toHaveLength(12)
    // The chairs sit on the row, not off it.
    const row = page.rects.find((r) => r.color === '#5E5CE6')!
    for (const c of page.circles ?? []) {
      expect(c.cx).toBeGreaterThan(row.x)
      expect(c.cx).toBeLessThan(row.x + row.w)
    }
  })

  it('paints the page the theme’s own ground', () => {
    expect(stageSheetPage(sheet, 'dark').background).toBe('#000000')
    expect(stageSheetPage(sheet, 'light').background).toBe('#ffffff')
  })

  it('draws a block square unless it is rounded, and an item as its picture with its name beneath', () => {
    const page = stageSheetPage(
      {
        ...sheet,
        blocks: [
          ...sheet.blocks,
          { area_id: 'Stage', label: 'Camera 1', person: null, color: '#30D158', x: 500, y: 300, w: 120, h: 120, rotation: 0, kind: 'item', seats: 0, corners: 'sharp', icon: 'camera' },
          { area_id: 'Stage', label: 'Mystery', person: null, color: '#BF5AF2', x: 700, y: 300, w: 120, h: 120, rotation: 0, kind: 'item', seats: 0, corners: 'sharp', icon: 'no-such-thing' },
        ],
      },
      'dark',
    )
    expect(page.rects.find((r) => r.color === '#0A84FF')!.radius).toBe(0)
    expect(page.rects.find((r) => r.color === '#5E5CE6')!.radius).toBeGreaterThan(0)
    // The camera: a path in its colour, no box, its name under it.
    expect(page.rects.find((r) => r.color === '#30D158')).toBeUndefined()
    const camera = page.paths!.find((p) => p.color === '#30D158')!
    expect(camera.d).toMatch(/^M3 5H14V13H3Z/)
    expect(camera.size).toBeGreaterThan(0)
    expect(page.texts.map((t) => t.text)).toContain('Camera 1')
    // A picture the app does not know: a plain box with the name.
    expect(page.rects.find((r) => r.color === '#BF5AF2')).toBeDefined()
    expect(page.texts.map((t) => t.text)).toContain('Mystery')
  })
})

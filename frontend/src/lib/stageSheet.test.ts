import { describe, expect, it } from 'vitest'
import { LANDSCAPE, stageSheetPage, type StageSheet } from './stageSheet'

const sheet: StageSheet = {
  title: 'English · Stage',
  subtitle: 'English Service · Sunday, 19 October 2026 · 11:30',
  width: 1200,
  height: 700,
  topLabel: 'Back of stage',
  bottomLabel: 'Front · congregation',
  blocks: [
    { label: 'Keyboard', person: 'Blessy T', color: '#0A84FF', x: 0, y: 0, w: 200, h: 120, rotation: 0, kind: 'block', seats: 0 },
    { label: 'Drums', person: null, color: '#FF9F0A', x: 1000, y: 580, w: 200, h: 120, rotation: 0, kind: 'block', seats: 0 },
    { label: 'Row A', person: null, color: '#5E5CE6', x: 100, y: 300, w: 600, h: 60, rotation: 0, kind: 'seats', seats: 12 },
  ],
  footer: '3 blocks · exported today',
}

describe('a stage as a sheet', () => {
  it('is a landscape page, with the title, both edges and the footer', () => {
    const page = stageSheetPage(sheet, 'dark')
    expect(page.width).toBeGreaterThan(page.height)
    expect(page.width).toBe(LANDSCAPE.width)
    const words = page.texts.map((t) => t.text)
    expect(words).toContain('English · Stage')
    expect(words).toContain('BACK OF STAGE')
    expect(words).toContain('FRONT · CONGREGATION')
    expect(words).toContain('3 blocks · exported today')
  })

  it('keeps every block in proportion and inside the stage, in its own colour', () => {
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
})

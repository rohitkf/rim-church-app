import { describe, expect, it } from 'vitest'
import { charWidth, textWidth, truncateToWidth, wrapText, wrapToLines } from './helveticaMetrics'

describe('charWidth', () => {
  // Checked against a real renderer: see the commit that added these.
  it('knows the widths a PDF reader will use', () => {
    expect(charWidth(' ')).toBe(278)
    expect(charWidth('W')).toBe(944)
    expect(charWidth('i')).toBe(222)
    expect(charWidth('W', true)).toBe(944)
    expect(charWidth('i', true)).toBe(278)
  })

  it('falls back for the Latin-1 characters it has no entry for', () => {
    expect(charWidth('£')).toBeGreaterThan(0)
    expect(charWidth('é', true)).toBeGreaterThan(0)
  })
})

describe('textWidth', () => {
  it('scales with the font size', () => {
    expect(textWidth('WOR-014', 10)).toBeCloseTo(textWidth('WOR-014', 20) / 2, 5)
  })

  it('makes bold wider than regular, as the label depends on', () => {
    expect(textWidth('Microphone', 12, true)).toBeGreaterThan(textWidth('Microphone', 12))
  })
})

describe('wrapText', () => {
  it('breaks on spaces and keeps every line inside the column', () => {
    const lines = wrapText('Shure SM58 Vocal Microphone spare stage left', 12, 120, true)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line, 12, true)).toBeLessThanOrEqual(120)
    expect(lines.join(' ')).toBe('Shure SM58 Vocal Microphone spare stage left')
  })

  // A serial number has no spaces to break at, and on a label the
  // overhang is off the edge of the sticker.
  it('cuts a word that cannot fit even on its own line', () => {
    const lines = wrapText('AC2094771XZ99001220', 12, 40, false)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(textWidth(line, 12, false)).toBeLessThanOrEqual(40)
    expect(lines.join('')).toBe('AC2094771XZ99001220')
  })

  it('gives one empty line rather than nothing for empty text', () => {
    expect(wrapText('', 12, 100)).toEqual([''])
  })
})

describe('wrapToLines', () => {
  it('leaves short text alone', () => {
    expect(wrapToLines('WOR-014', 12, 200, 2, true)).toEqual(['WOR-014'])
  })

  // Silently dropping the tail reads as the whole name until someone goes
  // looking for the item and cannot find it.
  it('marks the last line when it had to cut', () => {
    const lines = wrapToLines('Shure SM58 Vocal Microphone spare stage left cupboard', 12, 90, 2, true)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('...')).toBe(true)
    for (const line of lines) expect(textWidth(line, 12, true)).toBeLessThanOrEqual(90)
  })
})

describe('truncateToWidth', () => {
  it('returns text that already fits untouched', () => {
    expect(truncateToWidth('SM58-LC', 10, 200)).toBe('SM58-LC')
  })

  it('cuts with an ellipsis, still inside the width', () => {
    const out = truncateToWidth('Stage left cupboard, second shelf', 10, 60)
    expect(out.endsWith('...')).toBe(true)
    expect(textWidth(out, 10)).toBeLessThanOrEqual(60)
  })
})

describe('wrapping a code with no spaces in it', () => {
  it('breaks after a hyphen rather than mid-segment', () => {
    // 100pt holds "MED-BRT-0001-" at 12pt bold but not the whole code.
    const lines = wrapText('MED-BRT-0001-SPARE-B', 12, 100, true)
    expect(lines.join('')).toBe('MED-BRT-0001-SPARE-B')
    for (const line of lines) expect(line.endsWith('-') || line === lines.at(-1)).toBe(true)
  })

  it('still cuts a long unbroken run when there is no hyphen', () => {
    const lines = wrapText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12, 40, true)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })
})

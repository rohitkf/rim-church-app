import { describe, expect, it } from 'vitest'
import { labelSheetPages, labelSheetPdf, PER_PAGE, type ItemLabel } from './itemLabelPdf'

/** A 21x21 checkerboard stands in for a real QR; only its size matters here. */
const modules = Array.from({ length: 21 }, (_, r) =>
  Array.from({ length: 21 }, (_, c) => (r + c) % 2 === 0),
)

function label(overrides: Partial<ItemLabel> = {}): ItemLabel {
  return {
    assetTag: 'MED-BRT-0001',
    name: 'Vision Mixer',
    brand: 'Blackmagic Design',
    model: 'ATEM TV Studio 4K Pro',
    serial: 'BM-99182736',
    modules,
    ...overrides,
  }
}

/** The content stream is written uncompressed, so drawn text is readable here. */
function content(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

describe('labelSheetPages', () => {
  it('puts one QR and one of each detail on a sticker', () => {
    const text = content(labelSheetPdf([label()]))
    for (const value of [
      'MED-BRT-0001',
      'Vision Mixer',
      'Blackmagic Design',
      'BM-99182736',
    ]) {
      expect(text.split(`(${value})`).length - 1).toBe(1)
    }
  })

  it('prints a long code in full, wrapping onto a second line rather than cutting', () => {
    const code = 'MED-BRT-0001-SPARE-B'
    const [page] = labelSheetPages([label({ assetTag: code })])
    // Whatever it took — a smaller size, a second line — every character
    // of the code has to survive onto the sticker.
    const drawn = page.texts.map((t) => t.text).join('')
    expect(drawn).toContain(code)
    expect(drawn).not.toContain('...')
  })

  it('draws in black only — these are photocopied and printed on mono lasers', () => {
    const [page] = labelSheetPages([label()])
    const colours = new Set([
      ...page.rects.map((r) => r.color ?? '#000000'),
      ...(page.lines ?? []).map((l) => l.color ?? '#000000'),
      ...page.texts.map((t) => t.color ?? '#000000'),
    ])
    for (const colour of colours) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16))
      expect(r).toBe(g)
      expect(g).toBe(b)
    }
  })

  it('fills a page before starting another', () => {
    const many = Array.from({ length: PER_PAGE + 1 }, (_, i) =>
      label({ assetTag: `MED-BRT-${String(i).padStart(4, '0')}` }),
    )
    const pages = labelSheetPages(many)
    expect(pages).toHaveLength(2)
    expect(pages[0].texts.some((t) => t.text === 'MED-BRT-0000')).toBe(true)
    expect(pages[1].texts.some((t) => t.text === `MED-BRT-000${PER_PAGE}`)).toBe(true)
  })

  it('keeps every sticker inside the page', () => {
    const [page] = labelSheetPages(Array.from({ length: PER_PAGE }, () => label()))
    for (const r of page.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(page.width)
      expect(r.y + r.h).toBeLessThanOrEqual(page.height)
    }
    for (const t of page.texts) {
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeLessThanOrEqual(page.height)
    }
  })

  it('still makes a sticker for an item with nothing but a name', () => {
    const text = content(
      labelSheetPdf([label({ assetTag: null, brand: null, model: null, serial: null })]),
    )
    expect(text).toContain('(Vision Mixer)')
    expect(text).toContain('(NO CODE)')
  })
})

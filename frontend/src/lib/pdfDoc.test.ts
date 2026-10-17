import { describe, expect, it } from 'vitest'
import { A4, latin1ForPdf, buildPdf, pathOps } from './pdfDoc'

const decode = (bytes: Uint8Array) => String.fromCharCode(...bytes)

const sample = () =>
  buildPdf({
    ...A4,
    texts: [{ x: 50, y: 60, size: 12, text: 'Shure SM58 (spare)', bold: true }],
    rects: [{ x: 10, y: 10, w: 5, h: 5 }],
  })

describe('buildPdf', () => {
  it('writes a file a reader will accept', () => {
    const text = decode(sample())
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  // The cross-reference table is a list of byte offsets. If any of them is
  // wrong the file opens as a blank page or not at all, and nothing else in
  // the test suite would notice — so check each one lands on its object.
  it('points every xref offset at the object it claims', () => {
    const text = decode(sample())
    const startxref = Number(text.slice(text.lastIndexOf('startxref')).match(/\d+/)![0])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')

    // Counted from the trailer rather than hardcoded, so adding a font
    // changes the file without falsely failing the check that matters.
    const declared = Number(text.match(/\/Size (\d+)/)![1])
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)]
    expect(entries).toHaveLength(declared - 1)
    entries.forEach((entry, i) => {
      const offset = Number(entry[1])
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })

  it('declares the content stream at its real length', () => {
    const text = decode(sample())
    const declared = Number(text.match(/<< \/Length (\d+) >>/)![1])
    const body = text.slice(text.indexOf('stream\n') + 'stream\n'.length, text.indexOf('\nendstream'))
    expect(body.length).toBe(declared)
  })

  it('escapes the characters that would end a string early', () => {
    const text = decode(
      buildPdf({ ...A4, texts: [{ x: 0, y: 0, size: 10, text: 'a(b)c\\d' }], rects: [] }),
    )
    expect(text).toContain('(a\\(b\\)c\\\\d)')
  })

  it('stays single-byte, so the offsets it counted are the bytes written', () => {
    const text = 'Zoë — “quoted” £99 🎤'
    const bytes = buildPdf({ ...A4, texts: [{ x: 0, y: 0, size: 10, text }], rects: [] })
    // Latin-1 reaches 0xff, and one character is still one byte - which is
    // exactly what the xref offsets assume.
    expect(bytes.every((b) => b <= 0xff)).toBe(true)
    expect(String.fromCharCode(...bytes)).toContain('£99')
  })
})

describe('latin1ForPdf', () => {
  // A label that prints "?99.00" where the price should be is worse than
  // useless, and the pound sign is Latin-1 like the rest of these.
  it('keeps the Latin-1 characters a label actually needs', () => {
    expect(latin1ForPdf('£99.00 · Zoë Café')).toBe('£99.00 · Zoë Café')
  })

  it('folds what Latin-1 cannot hold to the letters underneath', () => {
    expect(latin1ForPdf('Budějovická')).toBe('Budejovická')
  })

  it('straightens the punctuation a word processor curls', () => {
    expect(latin1ForPdf('“quoted” — it’s')).toBe('"quoted" - it\'s')
  })

  it('replaces what it cannot fold', () => {
    expect(latin1ForPdf('mic 🎤')).toBe('mic ?')
  })
})

describe('pathOps', () => {
  it('turns the icon subset of SVG into PDF operators through the placing', () => {
    const ops = pathOps('M3 5H14V13H3Z M14 8L19 5.5 M9 5C9 3.34 10.34 2 12 2', (x, y) => [x * 2, 100 - y * 2])
    expect(ops).toBe('6 90 m 28 90 l 28 74 l 6 74 l h 28 84 m 38 89 l 18 90 m 18 93.32 20.68 96 24 96 c')
  })
  it('stops at a command it does not know rather than drawing nonsense', () => {
    expect(pathOps('M1 1L2 2A5 5 0 0 1 9 9L3 3', (x, y) => [x, y])).toBe('1 1 m 2 2 l')
  })
  it('strokes a page path in its colour', () => {
    const bytes = buildPdf({ width: 100, height: 100, texts: [], rects: [], paths: [{ d: 'M0 0L24 24', x: 10, y: 10, size: 24, color: '#ff0000', width: 2 }] })
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text).toContain('1 0 0 RG 2 w 1 J 1 j 10 90 m 34 66 l S Q')
  })
})

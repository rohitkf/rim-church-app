import { describe, expect, it } from 'vitest'
import { A4, latin1ForPdf, buildPdf } from './pdfDoc'

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

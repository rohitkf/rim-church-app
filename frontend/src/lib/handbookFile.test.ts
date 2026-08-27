import { describe, expect, it } from 'vitest'
import { checkHandbookFile, formatBytes, HANDBOOK_MAX_BYTES } from './handbookFile'

const file = (name: string, size = 1024) => ({ name, size })

describe('checkHandbookFile', () => {
  it('accepts a PDF and a Word document', () => {
    expect(checkHandbookFile(file('Media Handbook.pdf'))).toMatchObject({ ok: true, ext: 'pdf' })
    expect(checkHandbookFile(file('handbook.DOCX'))).toMatchObject({ ok: true, ext: 'docx' })
  })

  it('refuses anything else, including the old .doc', () => {
    expect(checkHandbookFile(file('notes.doc'))).toMatchObject({ ok: false })
    expect(checkHandbookFile(file('handbook.pages'))).toMatchObject({ ok: false })
    expect(checkHandbookFile(file('script.exe'))).toMatchObject({ ok: false })
    expect(checkHandbookFile(file('handbook'))).toMatchObject({ ok: false })
  })

  it('refuses an empty file', () => {
    expect(checkHandbookFile(file('handbook.pdf', 0))).toMatchObject({ ok: false })
  })

  it('holds the line at 30MB and says the actual size', () => {
    expect(checkHandbookFile(file('handbook.pdf', HANDBOOK_MAX_BYTES))).toMatchObject({ ok: true })
    const tooBig = checkHandbookFile(file('handbook.pdf', HANDBOOK_MAX_BYTES + 1))
    expect(tooBig.ok).toBe(false)
    expect(!tooBig.ok && tooBig.reason).toContain('30 MB')
  })
})

describe('formatBytes', () => {
  it('reads at a human scale', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatBytes(30 * 1024 * 1024)).toBe('30 MB')
  })
})

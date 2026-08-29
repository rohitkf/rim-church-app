import { describe, expect, it } from 'vitest'
import { itemLabelPdf, type ItemLabel } from './itemLabelPdf'

/** A 21x21 checkerboard stands in for a real QR; only its size matters here. */
const modules = Array.from({ length: 21 }, (_, r) =>
  Array.from({ length: 21 }, (_, c) => (r + c) % 2 === 0),
)

function label(assetTag: string): ItemLabel {
  return {
    title: 'Vision Mixer',
    teamName: 'Media',
    teamColor: '#b855f7',
    assetTag,
    statusLabel: 'In service',
    fields: [
      { label: 'Model', value: 'ATEM TV Studio 4K Pro' },
      { label: 'Location', value: 'Media Room' },
    ],
    modules,
    footer: 'Rehoboth International Ministries',
  }
}

/** The content stream is written uncompressed, so drawn text is readable here. */
function content(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

describe('itemLabelPdf', () => {
  it('prints the asset code in full on both labels', () => {
    const text = content(itemLabelPdf(label('MED-BRT-0001')))
    const hits = text.split('(MED-BRT-0001)').length - 1
    expect(hits).toBe(2)
  })

  it('shrinks a long code to fit rather than cutting it short', () => {
    // This one is well past what either column holds at full size — the old
    // label truncated it to "MED-BRT-0..." and lost the item's identity.
    const code = 'MED-BRT-0001-SPARE-B'
    const text = content(itemLabelPdf(label(code)))
    expect(text.split(`(${code})`).length - 1).toBe(2)
    expect(text).not.toContain('(MED-BRT-0...)')
  })
})

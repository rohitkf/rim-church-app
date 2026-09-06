import { describe, expect, it } from 'vitest'
import { channels, contrastFloor, contrastRatio, luminance } from './contrast'

describe('contrast', () => {
  it('knows the two ends of the scale', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5)
  })

  it('does not care which way round it is asked', () => {
    expect(contrastRatio('#1c1c1e', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#1c1c1e'),
      6,
    )
  })

  it('reads a three-digit hex the way CSS does', () => {
    expect(channels('#fff')).toEqual([255, 255, 255])
    expect(luminance('#fff')).toBeCloseTo(1, 5)
  })

  it('refuses a colour it cannot measure rather than guessing', () => {
    expect(() => channels('rgb(0 0 0 / 0.5)')).toThrow(/plain hex/)
  })

  it('asks less of large text, which carries on its own', () => {
    expect(contrastFloor({ size: 11 })).toBe(4.5)
    expect(contrastFloor({ size: 22, bold: true })).toBe(3)
    expect(contrastFloor({ size: 14, bold: true })).toBe(3)
    // 14pt on its own is not large text.
    expect(contrastFloor({ size: 14 })).toBe(4.5)
  })
})

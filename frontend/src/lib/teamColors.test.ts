import { describe, expect, it } from 'vitest'
import { TEAM_COLORS, normaliseHex, swatchesFor, teamColorName } from './teamColors'

describe('normaliseHex', () => {
  it('upper-cases and keeps the hash', () => {
    expect(normaliseHex('#30d158')).toBe('#30D158')
  })

  it('expands the short form and accepts a missing hash', () => {
    expect(normaliseHex('abc')).toBe('#AABBCC')
  })

  it('refuses anything that is not a hex colour', () => {
    expect(normaliseHex('rebeccapurple')).toBeNull()
    expect(normaliseHex('')).toBeNull()
    expect(normaliseHex(null)).toBeNull()
  })
})

describe('teamColorName', () => {
  it('names a palette colour exactly, whatever its casing', () => {
    expect(teamColorName('#30d158')).toBe('Green')
  })

  it('names an off-palette colour after its nearest neighbour', () => {
    // The old fixture green, never in the palette.
    expect(teamColorName('#10b981')).toBe('Mint')
  })

  it('falls back to a word rather than nothing', () => {
    expect(teamColorName(null)).toBe('Grey')
  })
})

describe('swatchesFor', () => {
  it('offers the palette when the team already wears one of them', () => {
    expect(swatchesFor('#0a84ff')).toEqual(TEAM_COLORS)
  })

  it('keeps an off-palette colour reachable, so opening the picker never loses it', () => {
    const swatches = swatchesFor('#10b981')
    expect(swatches).toHaveLength(TEAM_COLORS.length + 1)
    expect(swatches[0]).toEqual({ hex: '#10B981', name: 'Mint (current)' })
  })

  it('does not add a swatch for a team with no colour yet', () => {
    expect(swatchesFor(null)).toEqual(TEAM_COLORS)
  })
})

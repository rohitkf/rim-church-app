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

/*
 * The palette has to survive the gradient wash.
 *
 * A team's colour is drawn at 30% over a near-black tile, and that is
 * where a badly chosen one dies: dark and muted colours turn to sludge,
 * and two that look distinct as solid swatches can land on top of each
 * other once they are a tenth of themselves. Both of those are invisible
 * in review and obvious on a Sunday, so they are measured here instead.
 */
const DARK_TILE: RGB = [0x14, 0x14, 0x18] // --color-surface-lowest, dark theme
const WASH_ALPHA = 0.3

type RGB = [number, number, number]

const channels = (hex: string): RGB => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The colour as it actually reaches the eye at the wash's strongest stop. */
const washed = (hex: string): RGB => {
  const c = channels(hex)
  return c.map((v, i) => Math.round(v * WASH_ALPHA + DARK_TILE[i] * (1 - WASH_ALPHA))) as RGB
}

const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const relativeLuminance = ([r, g, b]: RGB) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

/** How far the washed colour lifts off the tile it is drawn on. */
const lift = (hex: string) => {
  const a = relativeLuminance(washed(hex))
  const b = relativeLuminance(DARK_TILE)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** CIE Lab, so "different" means different to an eye rather than to a number. */
const lab = (rgb: RGB): RGB => {
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [r, g, b] = rgb.map(toLinear)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

const distance = (one: string, two: string) => {
  const a = lab(washed(one))
  const b = lab(washed(two))
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/*
 * The floor is not a round number somebody liked: it is Tan against Grey,
 * the closest pair the palette shipped with long before this test. Holding
 * new colours to it means the picker never gets harder to read than it
 * already was, without pretending the original twelve were perfect.
 */
const FLOOR = distance('#A2845E', '#8E8E93')

describe('the palette under the gradient wash', () => {
  it('keeps every pair at least as distinct as Tan and Grey already were', () => {
    const tooClose: string[] = []
    for (let i = 0; i < TEAM_COLORS.length; i += 1) {
      for (let j = i + 1; j < TEAM_COLORS.length; j += 1) {
        const d = distance(TEAM_COLORS[i].hex, TEAM_COLORS[j].hex)
        if (d < FLOOR - 0.01) {
          tooClose.push(`${TEAM_COLORS[i].name}/${TEAM_COLORS[j].name} (${d.toFixed(1)})`)
        }
      }
    }
    expect(tooClose).toEqual([])
  })

  it('gives every colour enough light to read against black', () => {
    // Indigo is the dimmest of the original twelve and is allowed to stay;
    // nothing new may be dimmer than it.
    const floor = lift('#5E5CE6')
    const tooDark = TEAM_COLORS.filter((c) => lift(c.hex) < floor - 0.01).map((c) => c.name)
    expect(tooDark).toEqual([])
  })

  it('is all valid, uniquely named, normalised hex', () => {
    for (const colour of TEAM_COLORS) {
      expect(normaliseHex(colour.hex)).toBe(colour.hex)
    }
    const names = TEAM_COLORS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    const hexes = TEAM_COLORS.map((c) => c.hex)
    expect(new Set(hexes).size).toBe(hexes.length)
  })
})

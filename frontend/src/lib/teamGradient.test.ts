import { describe, expect, it } from 'vitest'
import {
  inkOn,
  teamFill,
  teamAvatarStyle,
  teamChipStyle,
  teamColorOf,
  teamSpine,
  teamWash,
  teamWashSoft,
} from './teamGradient'
import { DEFAULT_DEPT_COLOR } from './deptBadge'

describe('teamColorOf', () => {
  it('normalises whatever the team was given', () => {
    expect(teamColorOf('#30d158')).toBe('#30D158')
  })

  it('falls back for a team with no colour, or an unusable one', () => {
    expect(teamColorOf(null)).toBe(DEFAULT_DEPT_COLOR)
    expect(teamColorOf('rebeccapurple')).toBe(DEFAULT_DEPT_COLOR)
  })
})

describe('teamWash', () => {
  it('is nothing at all in dot mode, so a caller keeps its own surface', () => {
    expect(teamWash('#30d158', 'dot')).toBeUndefined()
    expect(teamWashSoft('#30d158', 'dot')).toBeUndefined()
  })

  it('caps its stops in pixels, so a desktop card is not washed end to end', () => {
    expect(teamWash('#30d158', 'gradient')!.backgroundImage).toContain('min(46%, 260px)')
    expect(teamWashSoft('#30d158', 'gradient')!.backgroundImage).toContain('min(52%, 300px)')
  })

  it('layers over the caller’s background rather than replacing it', () => {
    const wash = teamWash('#5e5ce6', 'gradient')!
    expect(wash.backgroundImage).toContain('rgb(94 92 230 / var(--team-wash-hi))')
    expect(wash.backgroundImage).toContain('transparent min(100%, 560px)')
    // A `background` shorthand would wipe out the row's own bg-raised.
    expect(wash.background).toBeUndefined()
  })

  it('washes a bright colour more lightly, so faint text on the row keeps 4.5:1', () => {
    // On dark, indigo carries most of its 30%, and yellow at 30% would
    // leave faint text at 2.9:1, so it is washed far less. On white it is
    // the other way round: yellow barely darkens the row, indigo does.
    const vars = (hex: string) => teamWash(hex, 'gradient') as Record<string, unknown>
    expect(vars('#5E5CE6')['--team-wash-hi-dark']).toBeGreaterThan(0.2)
    expect(vars('#FFD60A')['--team-wash-hi-dark']).toBeLessThanOrEqual(0.1)
    expect(vars('#FFD60A')['--team-wash-hi-light']).toBe(0.3)
    expect(vars('#5E5CE6')['--team-wash-hi-light']).toBeLessThan(0.15)
  })

  it('carries the team’s colour on its hairline too', () => {
    expect(teamWash('#30d158', 'gradient')!.boxShadow).toContain('inset 0 0 0 1px')
  })

  it('leaves a header strip without a hairline', () => {
    expect(teamWashSoft('#30d158', 'gradient')!.boxShadow).toBeUndefined()
  })
})

describe('teamSpine', () => {
  it('runs from the full colour down to a trace of it', () => {
    expect(teamSpine('#0a84ff').background).toBe(
      'linear-gradient(180deg, #0A84FF, rgb(10 132 255 / 0.25))',
    )
  })
})

/** Contrast of `ink` (hex, or black at an alpha) laid on the colour `ground`. */
function inkContrast(ink: string, ground: [number, number, number]): number {
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const alpha = ink === '#ffffff' ? null : ink === '#000000' ? 1 : Number(/\/ ([\d.]+)\)/.exec(ink)![1])
  const fg = alpha === null ? [255, 255, 255] : ground.map((v) => v * (1 - alpha))
  const [hi, lo] = [lum(fg), lum(ground)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const isDark = (ink: string) => ink === '#000000' || ink.startsWith('rgb(0 0 0')

describe('inkOn', () => {
  it('puts dark ink on a light colour and light ink on a dark one', () => {
    expect(isDark(inkOn('#FFD60A'))).toBe(true)
    expect(inkOn('#5E5CE6')).toBe('#ffffff')
  })

  it('judges by contrast, not by how dark a colour looks', () => {
    // White on these is under 4.5:1 (#0A84FF 3.6, #EF4444 3.8, #A855F7
    // 4.0) though each looks dark enough to carry it.
    for (const c of ['#0A84FF', '#EF4444', '#A855F7']) {
      expect(isDark(inkOn(c))).toBe(true)
      expect(inkContrast(inkOn(c), hex(c))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('teamFill', () => {
  it('keeps the ink at 4.5:1 from one end of an avatar to the other, in either theme', () => {
    // Opaque, so the theme behind it cannot change either end.
    for (const c of ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#5E5CE6', '#A855F7', '#FFD60A', '#EF4444', '#64D2FF', '#8E8E93']) {
      const stops = [...(teamFill(c).background as string).matchAll(/#[0-9A-F]{6}|rgb\((\d+) (\d+) (\d+)\)/g)]
        .map((m) => (m[0].startsWith('#') ? hex(m[0]) : ([+m[1], +m[2], +m[3]] as [number, number, number])))
      expect(stops).toHaveLength(2)
      for (const stop of stops) expect(inkContrast(inkOn(c), stop)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('teamAvatarStyle and teamChipStyle', () => {
  it('tint the colour behind coloured text in dot mode', () => {
    const avatar = teamAvatarStyle('#0a84ff', 'dot')
    expect(avatar.color).toBe('#0A84FF')
    expect(avatar.backgroundColor).toBe('rgb(10 132 255 / 0.16)')
    expect(avatar.background).toBeUndefined()
  })

  it('fill with the colour and flip the ink in gradient mode', () => {
    const avatar = teamAvatarStyle('#5e5ce6', 'gradient')
    expect(avatar.background).toContain('linear-gradient')
    expect(avatar.color).toBe('#ffffff')
    expect(isDark(teamChipStyle('#FFD60A', 'gradient').color as string)).toBe(true)
  })
})

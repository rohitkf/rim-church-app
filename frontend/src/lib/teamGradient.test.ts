import { describe, expect, it } from 'vitest'
import {
  inkOn,
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
    // On a dark tile indigo carries the full 30%, and yellow at 30% would
    // leave faint text at 2.9:1, so it is washed far less. On white it is
    // the other way round: yellow barely darkens the row, indigo does.
    const vars = (hex: string) => teamWash(hex, 'gradient') as Record<string, unknown>
    expect(vars('#5E5CE6')['--team-wash-hi-dark']).toBe(0.3)
    expect(vars('#FFD60A')['--team-wash-hi-dark']).toBeLessThanOrEqual(0.15)
    expect(vars('#FFD60A')['--team-wash-hi-light']).toBe(0.3)
    expect(vars('#5E5CE6')['--team-wash-hi-light']).toBeLessThan(0.2)
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

describe('inkOn', () => {
  it('puts dark ink on a light colour and light ink on a dark one', () => {
    expect(inkOn('#FFD60A')).toBe('rgb(0 0 0 / 0.8)')
    expect(inkOn('#5E5CE6')).toBe('#ffffff')
  })

  it('judges by contrast, not by how dark a colour looks', () => {
    // White on these is under 4.5:1 (#0A84FF 3.6, #EF4444 3.8, #A855F7
    // 4.0) though each looks dark enough to carry it.
    expect(inkOn('#0A84FF')).toBe('rgb(0 0 0 / 0.8)')
    expect(inkOn('#EF4444')).toBe('rgb(0 0 0 / 0.8)')
    expect(inkOn('#A855F7')).toBe('rgb(0 0 0 / 0.8)')
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
    expect(teamChipStyle('#FFD60A', 'gradient').color).toBe('rgb(0 0 0 / 0.8)')
  })
})

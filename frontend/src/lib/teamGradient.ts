import type { CSSProperties } from 'react'
import { DEFAULT_DEPT_COLOR } from './deptBadge'
import { normaliseHex } from './teamColors'
import type { TeamStylePreference } from './teamStyle'

/**
 * The gradient half of a team's identity.
 *
 * Every recipe here derives from the one colour an admin picked, so the
 * colour picker doesn't change: a team chooses green, and green is what
 * washes its row, fills its avatar and lights its spine. Alpha is made
 * from the hex directly, so any colour — including a team coloured before
 * the palette existed — works.
 *
 * A wash's stops are capped in pixels as well as percentages: the design
 * draws them on a 393px phone row, and a bare percentage would stretch the
 * same wash across a 1360px desktop card until the whole tile was coloured.
 *
 * Every wash is a `backgroundImage`, never a `background`: it layers over
 * whatever surface the caller already has rather than replacing it, so a
 * washed row keeps its own tile colour and fades to exactly that at the
 * far end — in either theme, with no token to keep in sync.
 */

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The colour at a given opacity, written out as rgb rather than built with
 * `color-mix`. A gradient stop has to be a colour every CSS engine that
 * touches these styles can parse, and since the hex is already normalised
 * there is nothing to gain from asking CSS to do the arithmetic.
 */
function tint(color: string, pct: number): string {
  const [r, g, b] = channels(color)
  return `rgb(${r} ${g} ${b} / ${pct / 100})`
}

/** WCAG relative luminance of an sRGB colour, 0 (black) to 1 (white). */
function luminanceOf([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `color` laid over `ground` at `alpha`, as the eye sees it. */
function over(color: [number, number, number], ground: [number, number, number], alpha: number): [number, number, number] {
  return [0, 1, 2].map((i) => color[i] * alpha + ground[i] * (1 - alpha)) as [number, number, number]
}

/*
 * The quietest text that sits on a washed row (on-surface-faint) and the
 * ground under the wash, in each theme — from index.css. A wash is only as
 * strong as lets that text keep 4.5:1 in both, so a yellow team's row is
 * washed more lightly than an indigo one's, and a meaning never drops out
 * of a row because of the colour a team picked. The ground is a row's
 * (`raised` laid on the tile), not the tile's own: a step lighter on dark
 * and a step darker on light, and judging by the tile alone left faint
 * text on a washed row at 4.0:1.
 */
const FAINT_ON_TILE = {
  dark: [channels('#98989d'), channels('#202024')],
  light: [channels('#68686d'), channels('#f6f6f6')],
} as const

/** The strongest wash, up to `ceiling`, that keeps faint text readable on it in one theme. */
function washStrength(color: string, ceiling: number, theme: 'dark' | 'light'): number {
  const c = channels(color)
  const [ink, tile] = FAINT_ON_TILE[theme]
  let alpha = ceiling
  // 4.6, not 4.5: a row's ground varies by a shade with what it sits in.
  while (alpha > 0.04 && contrast(ink, over(c, tile, alpha)) < 4.6) alpha = Math.round((alpha - 0.01) * 100) / 100
  return alpha
}

/*
 * A wash's strength differs by theme — a colour that darkens a white row
 * too far is fine on a black one, and the other way round — so it is
 * carried as two pairs of custom properties, and index.css ("Team
 * washes") hands the gradient whichever pair the theme on <html> needs.
 * The gradient itself stays rgb(r g b / a), as every engine parses.
 */
function washVars(color: string, high: number, low: number): CSSProperties {
  const kd = washStrength(color, high, 'dark') / high
  const kl = washStrength(color, high, 'light') / high
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    ['--team-wash-hi-dark' as string]: round(high * kd),
    ['--team-wash-lo-dark' as string]: round(low * kd),
    ['--team-wash-hi-light' as string]: round(high * kl),
    ['--team-wash-lo-light' as string]: round(low * kl),
  } as CSSProperties
}

/** The team's colour at whatever strength the theme's wash allows. */
function washStop(color: string, end: 'hi' | 'lo'): string {
  const [r, g, b] = channels(color)
  return `rgb(${r} ${g} ${b} / var(--team-wash-${end}))`
}

/** The team's colour, whatever shape it arrived in. */
export function teamColorOf(color: string | null | undefined): string {
  return normaliseHex(color) ?? DEFAULT_DEPT_COLOR
}

/**
 * The wash across a row or a tile: strong at the leading edge, gone by the
 * far end. `undefined` in dot mode, so a caller can spread it
 * unconditionally and keep its own classes when the preference is off.
 */
export function teamWash(
  color: string | null | undefined,
  style: TeamStylePreference,
): CSSProperties | undefined {
  if (style !== 'gradient') return undefined
  const c = teamColorOf(color)
  return {
    ...washVars(c, 0.3, 0.1),
    backgroundImage: `linear-gradient(100deg, ${washStop(c, 'hi')} 0%, ${washStop(c, 'lo')} min(46%, 260px), transparent min(100%, 560px))`,
    boxShadow: `inset 0 0 0 1px ${tint(c, 28)}`,
  }
}

/** The quieter wash for a header strip: no hairline, fades to nothing. */
export function teamWashSoft(
  color: string | null | undefined,
  style: TeamStylePreference,
): CSSProperties | undefined {
  if (style !== 'gradient') return undefined
  const c = teamColorOf(color)
  return {
    ...washVars(c, 0.28, 0.07),
    backgroundImage: `linear-gradient(100deg, ${washStop(c, 'hi')} 0%, ${washStop(c, 'lo')} min(52%, 300px), transparent min(100%, 620px))`,
  }
}

/** The vertical bar that replaces the dot: full colour at the top, fading down. */
export function teamSpine(color: string | null | undefined): CSSProperties {
  const c = teamColorOf(color)
  return { background: `linear-gradient(180deg, ${c}, ${tint(c, 25)})` }
}

/*
 * Ink on a team's colour. White where the colour carries it at 4.5:1;
 * otherwise near-black, as faint as still clears 4.5:1 — judged by WCAG
 * contrast, not by how bright the colour looks, since a mid red or
 * purple looks dark and still carries white at under 4:1. Between them
 * one always clears it: the two cross at about 4.6:1.
 */
const DARK_INK_ALPHAS = [0.8, 0.85, 0.9, 0.95, 1]

function inkFor(c: [number, number, number]): { white: boolean; css: string } {
  const white = contrast([255, 255, 255], c)
  if (white >= 4.5) return { white: true, css: '#ffffff' }
  const alpha = DARK_INK_ALPHAS.find((a) => contrast(over([0, 0, 0], c, a), c) >= 4.5) ?? 1
  if (contrast(over([0, 0, 0], c, alpha), c) < white) return { white: true, css: '#ffffff' }
  return { white: false, css: alpha === 1 ? '#000000' : `rgb(0 0 0 / ${alpha})` }
}

/**
 * A filled shape — an avatar tile or a name chip — in the team's colour.
 *
 * Opaque, and the far end always moves away from the ink: darker under
 * white letters, lighter under dark ones. It used to fade to the colour at
 * 40% over whatever was behind it, which on dark turned a purple avatar
 * near-black under the dark ink its bright end needed (2.5:1).
 */
export function teamFill(color: string | null | undefined, angle = 140): CSSProperties {
  const c = channels(teamColorOf(color))
  const toward: [number, number, number] = inkFor(c).white ? [0, 0, 0] : [255, 255, 255]
  const [r, g, b] = over(toward, c, 0.22).map(Math.round)
  return { background: `linear-gradient(${angle}deg, ${teamColorOf(color)}, rgb(${r} ${g} ${b}))` }
}

/** Ink for two letters on a team's colour (see `inkFor`). */
export function inkOn(color: string | null | undefined): string {
  return inkFor(channels(teamColorOf(color))).css
}

/** The avatar tile: a tint behind coloured letters, or the colour itself. */
export function teamAvatarStyle(
  color: string | null | undefined,
  style: TeamStylePreference,
): CSSProperties {
  const c = teamColorOf(color)
  if (style !== 'gradient') return { backgroundColor: tint(c, 16), color: c }
  return { ...teamFill(c), color: inkOn(c) }
}

/** The name chip: a tint behind coloured text, or the colour itself. */
export function teamChipStyle(
  color: string | null | undefined,
  style: TeamStylePreference,
): CSSProperties {
  const c = teamColorOf(color)
  if (style !== 'gradient') return { backgroundColor: tint(c, 15), color: c }
  return { ...teamFill(c, 100), color: inkOn(c) }
}

/**
 * The band behind a section heading.
 *
 * Deliberately uncapped, unlike the row washes above: those are drawn on a
 * phone row and capped in pixels so they don't flood a wide card, but a
 * heading's whole job is to separate one team's block from the next, and a
 * band that gives up a third of the way across separates nothing. So this
 * one runs edge to edge and stays faintly lit at the far end rather than
 * fading to nothing.
 *
 * In dot mode there is no band — the preference is for flat colour — but
 * the rule under the heading still takes the team's colour, so the titles
 * are told apart either way.
 */
export function teamHeadingStyle(
  color: string | null | undefined,
  style: TeamStylePreference,
): CSSProperties {
  const c = teamColorOf(color)
  if (style !== 'gradient') return { borderBottomColor: tint(c, 45) }
  return {
    backgroundImage: `linear-gradient(90deg, ${tint(c, 26)} 0%, ${tint(c, 13)} 45%, ${tint(c, 5)} 100%)`,
    borderBottomColor: tint(c, 45),
  }
}

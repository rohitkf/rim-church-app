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
    backgroundImage: `linear-gradient(100deg, ${tint(c, 30)} 0%, ${tint(c, 10)} min(46%, 260px), transparent min(100%, 560px))`,
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
    backgroundImage: `linear-gradient(100deg, ${tint(c, 28)} 0%, ${tint(c, 7)} min(52%, 300px), transparent min(100%, 620px))`,
  }
}

/** The vertical bar that replaces the dot: full colour at the top, fading down. */
export function teamSpine(color: string | null | undefined): CSSProperties {
  const c = teamColorOf(color)
  return { background: `linear-gradient(180deg, ${c}, ${tint(c, 25)})` }
}

/** A filled shape — an avatar tile or a name chip — in the team's colour. */
export function teamFill(color: string | null | undefined, angle = 140): CSSProperties {
  const c = teamColorOf(color)
  return { background: `linear-gradient(${angle}deg, ${c}, ${tint(c, 40)})` }
}

/**
 * Black ink on a light colour, white on a dark one, so two letters survive
 * yellow as well as indigo.
 */
export function inkOn(color: string | null | undefined): string {
  const hex = teamColorOf(color)
  const n = parseInt(hex.slice(1), 16)
  const luminance = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return luminance > 150 ? 'rgb(0 0 0 / 0.8)' : '#ffffff'
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

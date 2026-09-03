/**
 * The eighteen colours a team can wear.
 *
 * A team's colour is an identity, not a free choice: it has to stay legible
 * as a tint behind two letters, as text on a dark tile, and as a dot in a
 * rota — which is what the OS colour dialog cannot promise. So the palette
 * is curated, every entry has a name, and the picker offers these and
 * nothing else.
 *
 * The hard constraint is the gradient wash, which draws a team's colour at
 * 30% over a near-black tile. That is a brutal filter: anything dark or
 * muted turns to sludge there, and two colours that look distinct as solid
 * swatches can land on top of each other once they are a tenth of
 * themselves. So these were chosen by measurement rather than by eye —
 * every pair is at least as far apart, washed, as the closest pair the
 * palette already shipped with, and every one of the six added here lifts
 * further off black than the dimmest of the original twelve. The test
 * beside this file holds both of those, so the next colour somebody adds
 * has to earn its place the same way.
 *
 * They are listed as a spectrum — round the wheel, then the neutrals —
 * because eighteen swatches in no particular order is a worse picker than
 * twelve.
 */

export type TeamColor = { hex: string; name: string }

/** In the order they appear in the picker: round the wheel, then neutrals. */
export const TEAM_COLORS: TeamColor[] = [
  { hex: '#5E5CE6', name: 'Indigo' },
  { hex: '#0A84FF', name: 'Blue' },
  { hex: '#64D2FF', name: 'Sky' },
  // The corridor between Sky and Mint was the narrowest of the four gaps:
  // every gentler cyan sat on top of one or the other, so this one is
  // saturated on purpose.
  { hex: '#00E5F0', name: 'Aqua' },
  { hex: '#34D399', name: 'Mint' },
  { hex: '#30D158', name: 'Green' },
  // Yellow to Green was an 85-degree hole — by far the widest, and the
  // reason the palette used to have no fresh green at all.
  { hex: '#AEE63C', name: 'Lime' },
  { hex: '#F2E680', name: 'Butter' },
  { hex: '#FFD60A', name: 'Yellow' },
  { hex: '#FF9F0A', name: 'Orange' },
  { hex: '#FFAE6B', name: 'Apricot' },
  { hex: '#FF6961', name: 'Coral' },
  { hex: '#FF375F', name: 'Pink' },
  { hex: '#FF8CC6', name: 'Rose' },
  { hex: '#BF5AF2', name: 'Purple' },
  // Neutrals last. Ice is the bright one the set never had: Grey and Tan
  // both go flat against black, and a team that wants to read as plain
  // rather than dim had nothing to pick.
  { hex: '#A2845E', name: 'Tan' },
  { hex: '#8E8E93', name: 'Grey' },
  { hex: '#E6EAF2', name: 'Ice' },
]

/**
 * One spelling for a colour, so `#30d158` and `#30D158` are the same
 * swatch. Short form (`#abc`) is expanded; anything that isn't a hex colour
 * comes back null rather than being half-repaired.
 */
export function normaliseHex(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('').toUpperCase()}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`
  return null
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * What to call a colour. Teams coloured before this palette existed keep
 * whatever hex they were given, so the nearest named colour is what the
 * preview line says — better an approximate word than none.
 */
export function teamColorName(value: string | null | undefined): string {
  const hex = normaliseHex(value)
  if (!hex) return 'Grey'
  const exact = TEAM_COLORS.find((c) => c.hex === hex)
  if (exact) return exact.name
  const [r, g, b] = channels(hex)
  let best = TEAM_COLORS[0]
  let bestDistance = Infinity
  for (const candidate of TEAM_COLORS) {
    const [cr, cg, cb] = channels(candidate.hex)
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best.name
}

/**
 * The swatches to show for a team. A team already wearing a colour that
 * isn't in the palette keeps it as a thirteenth swatch — opening the picker
 * must never be the thing that silently changes a team's colour.
 */
export function swatchesFor(current: string | null | undefined): TeamColor[] {
  const hex = normaliseHex(current)
  if (!hex || TEAM_COLORS.some((c) => c.hex === hex)) return TEAM_COLORS
  return [{ hex, name: `${teamColorName(hex)} (current)` }, ...TEAM_COLORS]
}

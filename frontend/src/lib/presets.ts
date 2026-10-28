import { isPageCapability } from './pageCells'
import {
  CAPABILITY_KEYS,
  ruleFor,
  type CapabilityKey,
  type GrantRole,
  type Overrides,
  type Reach,
} from './permissions'

/**
 * A place to start from: the whole grid set one way at once, as a draft.
 *
 * A preset only fills the draft — the page then says what saving would do
 * to whom, and nothing changes until Save. It sets the five profiles a
 * church usually means when it says "strict" or "open"; an Admin's cells,
 * Overwatch's, a Pastor's and who may open which page are left as they
 * are, and so is every team's own rule.
 */

export type PresetKey = 'strict' | 'balanced' | 'open'

export const PRESETS: { key: PresetKey; label: string; blurb: string }[] = [
  {
    key: 'strict',
    label: 'Strict',
    blurb: 'Never more than the app’s defaults: each team’s Heads keep their own team, and everybody else gets the least each row allows.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    blurb: 'The app’s own defaults: Heads run their team, members do their own part of it.',
  },
  {
    key: 'open',
    label: 'Open',
    blurb: 'Never less than the app’s defaults: everybody on a team may do on it what its Heads may.',
  },
]

/** The profiles a preset sets. */
const SET: readonly GrantRole[] = ['head', 'assistant', 'coordinator', 'member', 'newcomer']

const LEADS: readonly GrantRole[] = ['head', 'assistant']

const RANK: Record<Reach, number> = { none: 0, own: 1, team: 2, all: 3 }

/**
 * What a preset gives one profile, out of what the row offers it. Strict
 * only ever narrows the app's default, and Open only ever widens it.
 */
function reachFor(preset: PresetKey, cap: CapabilityKey, role: GrantRole): Reach {
  const { reaches, byDefault } = ruleFor(cap, role)
  if (preset === 'balanced') return byDefault
  if (preset === 'strict') {
    // Heads keep their own team; everybody else gets the least on offer.
    const least = LEADS.includes(role) && reaches.includes('team') ? 'team' : reaches[0]
    return RANK[least] < RANK[byDefault] ? least : byDefault
  }
  // Open: a team's people may do on it what its Heads may, and no further.
  if (role === 'newcomer' || !reaches.includes('team')) return byDefault
  return RANK.team > RANK[byDefault] ? 'team' : byDefault
}

/**
 * The church's cells as the preset sets them, over what is stored: the
 * rows and profiles a preset does not touch keep what they have.
 */
export function presetOver(preset: PresetKey, stored: Overrides): Overrides {
  const out: Overrides = { ...stored }
  for (const cap of CAPABILITY_KEYS) {
    if (isPageCapability(cap)) continue
    for (const role of SET) {
      if (ruleFor(cap, role).reaches.length < 2) continue
      out[cap] = { ...out[cap], [role]: reachFor(preset, cap, role) }
    }
  }
  return out
}

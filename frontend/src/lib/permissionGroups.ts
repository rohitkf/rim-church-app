import { PERMISSIONS } from './permissionMatrix'
import { grantIsValid, type CapabilityKey, type GrantReach } from './permissions'

/*
 * The grid's rights, sorted for choosing from.
 *
 * Giving somebody a right by name used to be one long list in a menu: a
 * hundred sentences in alphabetical order, each cut off at the menu's
 * edge. The Owner (November 2026): "I have to scroll through a sea of
 * permissions [...] grouped by pages or features or something".
 *
 * So they are grouped the way Settings › Access & Privileges already
 * groups them: by area (Services & planning, Team rota, People…), in the
 * grid's own order, each right by its two or three words with the whole
 * sentence under it.
 */

export interface PickRow {
  key: CapabilityKey
  /** Two or three words, where the grid has them; otherwise the sentence. */
  short: string
  /** The whole sentence, as the grid says it. Empty when `short` already is it. */
  action: string
}

export interface PickGroup {
  area: string
  rows: PickRow[]
}

/** The rights in `keys`, under the area each belongs to, in the grid's order. A right the grid lists twice is shown once. */
export function groupCapabilities(keys: readonly CapabilityKey[]): PickGroup[] {
  const wanted = new Set<CapabilityKey>(keys)
  const seen = new Set<CapabilityKey>()
  const groups: PickGroup[] = []
  for (const area of PERMISSIONS) {
    const rows: PickRow[] = []
    for (const c of area.capabilities) {
      if (!c.key || !wanted.has(c.key) || seen.has(c.key)) continue
      seen.add(c.key)
      // Where the few words are the sentence, it is said once.
      rows.push({ key: c.key, short: c.short ?? c.action, action: c.short && c.short !== c.action ? c.action : '' })
    }
    if (rows.length > 0) groups.push({ area: area.area, rows })
  }
  // Anything the grid does not file under an area is still offered.
  const rest = keys.filter((k) => !seen.has(k))
  if (rest.length > 0) groups.push({ area: 'Other', rows: rest.map((key) => ({ key, short: key, action: '' })) })
  return groups
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * What a search finds: every word typed is somewhere in the right's words
 * or its area's name, in any order. A word that is the area's finds the
 * whole area.
 */
export function searchGroups(groups: readonly PickGroup[], typed: string): PickGroup[] {
  const words = plain(typed).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...groups]
  return groups
    .map((g) => ({
      area: g.area,
      rows: g.rows.filter((r) => {
        const hay = plain(`${g.area} ${r.short} ${r.action}`)
        return words.every((w) => hay.includes(w))
      }),
    }))
    .filter((g) => g.rows.length > 0)
}

/**
 * How far a right is given when `wanted` was asked for of several at once:
 * as asked where it can be, otherwise the one way it can (lib/permissions
 * `grantIsValid`). Some rights are only ever a team's, some only the whole
 * church's.
 */
export function reachFor(cap: CapabilityKey, wanted: GrantReach): GrantReach {
  if (grantIsValid(cap, wanted)) return wanted
  return wanted === 'team' ? 'all' : 'team'
}

/** Said beside a right that can only be given one way, whatever "How far" says; null for one that goes both. */
export function oneWayOnly(cap: CapabilityKey, words: Record<GrantReach, string>): string | null {
  const team = grantIsValid(cap, 'team')
  const all = grantIsValid(cap, 'all')
  if (team && all) return null
  return `${words[all ? 'all' : 'team']} only`
}

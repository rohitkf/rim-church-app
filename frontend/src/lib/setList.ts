import type { RotaAssignment, SetListItem } from './types'

export interface SongLeader {
  id: string
  name: string
  /** What the rota has them down as, for telling two Graces apart. */
  role: string
}

/**
 * Who can be put against a song.
 *
 * The worship team on that service's rota, not the whole church and not a
 * free-text box. Typing a name would let the set list and the rota
 * disagree about who is even in the building, and the set list would be
 * the one that was wrong — the rota is where being asked to serve is
 * actually decided.
 *
 * Everybody the worship team has rostered is offered, not only the roles
 * called "Worship Leader": a backing vocal takes the second verse often
 * enough, and a list that refuses to admit it would send somebody back to
 * a paper one.
 */
export function songLeaders(
  assignments: RotaAssignment[],
  serviceId: string,
  worshipDepartmentId: string | null,
): SongLeader[] {
  if (!worshipDepartmentId) return []
  const seen = new Map<string, SongLeader>()
  for (const a of assignments) {
    if (a.service_id !== serviceId || a.department_id !== worshipDepartmentId) continue
    if (!a.profile) continue
    const name = `${a.profile.first_name} ${a.profile.last_name}`.trim()
    // Somebody down for two roles is one person who can sing, listed once,
    // under the first role the rota gives them.
    if (!seen.has(a.user_id)) seen.set(a.user_id, { id: a.user_id, name, role: a.role_label })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A link worth showing as a link.
 *
 * Anything else — a note to self, a half-typed address — is left as the
 * text it is rather than rendered as something clickable that goes
 * nowhere. `javascript:` and `data:` are refused outright: this field is
 * typed by one person and read by the whole church.
 */
export function safeSongLink(link: string | null | undefined): string | null {
  const raw = (link ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    // No scheme typed. "youtube.com/watch?v=..." is what people paste, and
    // assuming https of it is right far more often than not.
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`
    return null
  }
}

/** The songs of one service, in the order they are sung. */
export function songsFor(items: SetListItem[], serviceId: string): SetListItem[] {
  return items
    .filter((i) => i.service_id === serviceId)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Where a new song goes: after the last one. */
export function nextSongOrder(items: SetListItem[], serviceId: string): number {
  return songsFor(items, serviceId).reduce((max, i) => Math.max(max, i.sort_order + 1), 0)
}

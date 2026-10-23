import type { PollAudience } from './pollAudience'

/**
 * Who counts as a guest of a poll, and which of them it asks (0177).
 *
 * A guest is somebody who comes into the poll's audience only through a
 * guest place on a team. The database decides who is asked and told
 * (poll_person_is_guest, poll_admits); this is the same rule, worked out
 * from the rows the asker can read, so the picker lists the people that
 * rule would leave out. A Church Member on no team is never a guest, and a
 * poll for named people asks exactly those names.
 */

export interface TeamPlace {
  user_id: string
  department_id: string
  member_type: string
  team: string
  name: string
}

export interface RotaPlace {
  user_id: string
  department_id: string
}

export interface PollGuest {
  id: string
  name: string
  /** The teams they are a guest on, within the poll's reach. */
  teams: { id: string; name: string }[]
}

/** The guests a poll with this audience would reach, by name. */
export function guestCandidates(
  audience: PollAudience,
  places: TeamPlace[],
  opts: { teamId?: string; rota?: RotaPlace[] } = {},
): PollGuest[] {
  if (audience === 'people') return []
  const guestPlaces = places.filter((p) => p.member_type === 'guest')
  const isCore = (uid: string, dept?: string) =>
    places.some((p) => p.user_id === uid && p.member_type === 'core' && (!dept || p.department_id === dept))

  let chosen: TeamPlace[]
  if (audience === 'team') {
    if (!opts.teamId) return []
    chosen = guestPlaces.filter((p) => p.department_id === opts.teamId)
  } else if (audience === 'service') {
    const rota = (opts.rota ?? []).filter((r) => !opts.teamId || r.department_id === opts.teamId)
    // On the rota with a team they are a guest on, and core on none of the
    // teams they serve with there.
    chosen = guestPlaces.filter(
      (p) =>
        rota.some((r) => r.user_id === p.user_id && r.department_id === p.department_id) &&
        !rota.some((r) => r.user_id === p.user_id && isCore(p.user_id, r.department_id)),
    )
  } else {
    chosen = guestPlaces.filter((p) => !isCore(p.user_id))
  }

  const byPerson = new Map<string, PollGuest>()
  for (const p of chosen) {
    const g = byPerson.get(p.user_id) ?? { id: p.user_id, name: p.name, teams: [] }
    if (!g.teams.some((t) => t.id === p.department_id)) g.teams.push({ id: p.department_id, name: p.team })
    byPerson.set(p.user_id, g)
  }
  return [...byPerson.values()]
    .map((g) => ({ ...g, teams: g.teams.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The teams the candidates are guests on, for the one-tap team buttons. */
export function guestTeams(guests: PollGuest[]): { id: string; name: string }[] {
  const teams = new Map<string, string>()
  for (const g of guests) for (const t of g.teams) teams.set(t.id, t.name)
  return [...teams].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Guests whose name, or one of whose teams, contains the search. */
export function matchGuests(guests: PollGuest[], search: string): PollGuest[] {
  const q = search.trim().toLowerCase()
  if (!q) return guests
  return guests.filter(
    (g) => g.name.toLowerCase().includes(q) || g.teams.some((t) => t.name.toLowerCase().includes(q)),
  )
}

/**
 * What a poll stores for its guests. Everyone picked is `null` — every
 * guest, today's and any added later; nobody picked leaves guests out.
 */
export function guestPayload(
  include: boolean,
  picked: Set<string>,
  candidates: PollGuest[],
): { include_guests: boolean; guest_ids: string[] | null } {
  if (!include) return { include_guests: false, guest_ids: null }
  const ids = candidates.map((g) => g.id).filter((id) => picked.has(id))
  if (ids.length === 0 && candidates.length > 0) return { include_guests: false, guest_ids: null }
  if (ids.length === candidates.length) return { include_guests: true, guest_ids: null }
  return { include_guests: true, guest_ids: ids }
}

/** The guest note on a poll's card, or nothing when every guest is asked. */
export function guestNote(poll: { audience: PollAudience; include_guests: boolean; guest_ids: string[] | null }): string | null {
  if (poll.audience === 'people') return null
  if (!poll.include_guests) return 'No guests'
  if (poll.guest_ids) return `${poll.guest_ids.length} ${poll.guest_ids.length === 1 ? 'guest' : 'guests'}`
  return null
}

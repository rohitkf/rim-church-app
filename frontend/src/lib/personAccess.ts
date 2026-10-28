import type { AppSettings } from './appSettings'
import type { Allowed, Capability, RoleKey } from './permissionMatrix'
import { OVERWATCH_READS, overwatchActOf, overwatchMay, overwatchOpens } from './overwatch'
import { pageOpening, type PageOpening } from './pageOpening'
import { standingOf } from './pageAccess'
import {
  grantedBy,
  isOverwatchOnly,
  type CapabilityKey,
  type Granter,
  type Holder,
  type Overrides,
  type PermissionGrant,
  type TeamOverrides,
} from './permissions'

/**
 * What one person may do, and why — Settings › Access › By person.
 *
 * The question an Owner brings is about somebody: "can Asha change the
 * rota?". The grid answers it a profile at a time, the page rules a page
 * at a time, and five rooms keep lists of their own, so the answer used to
 * be the sum of eight screens. This works it out once, from the same
 * functions the buttons and the menu ask (`grantedBy()` is `decide()`,
 * `pageOpening()` is the menu's), so it cannot say something they don't.
 *
 * It reads; it changes nothing.
 */

/** Everything about a person that the rules ask. */
export interface PersonFacts {
  id: string
  owner: boolean
  admin: boolean
  overwatch: boolean
  pastor: boolean
  /** Teams they head. */
  headTeams: readonly string[]
  /** Teams they assist, as Assisting Head. */
  assistTeams: readonly string[]
  /** Teams whose roster they are on, as core or guest. */
  memberTeams: readonly string[]
  /** Teams the rota has them in Team Coordinator for, at some service. */
  coordinatorTeams: readonly string[]
}

/** A person as `decide()` takes them, with the church's grants (0208). */
export function holderOf(p: PersonFacts, grants: readonly PermissionGrant[] = []): Holder {
  const led = [...new Set([...p.headTeams, ...p.assistTeams])]
  return {
    myId: p.id,
    owner: p.owner,
    admin: p.admin,
    ledTeams: led,
    headTeams: p.headTeams,
    assistTeams: p.assistTeams,
    memberTeams: p.memberTeams,
    coordinatesAnywhere: p.coordinatorTeams.length > 0,
    pastor: p.pastor,
    grants,
  }
}

/** Who gave a yes, as By person says it. */
export type Via = Granter | 'overwatch'

/** How far one action reaches for one person. */
export type Answer =
  /** Every team, and anything that belongs to none. */
  | { kind: 'everywhere'; via: Via }
  /**
   * Some teams. `church` is set when they may also do it where no team is
   * involved, but some team's own rule narrows them there.
   */
  | { kind: 'teams'; teams: { id: string; via: Via }[]; church: Via | null }
  /** Only on what is theirs. */
  | { kind: 'own'; via: Via }
  | { kind: 'none' }

/**
 * One action, for one person: everywhere, on some teams, only their own,
 * or not at all, with the profile that gave each yes.
 */
export function explainCapability(
  person: PersonFacts,
  cap: CapabilityKey,
  overrides: Overrides,
  teamRules: TeamOverrides,
  teamIds: readonly string[],
  settings: AppSettings,
  grants: readonly PermissionGrant[] = [],
): Answer {
  const holder = holderOf(person, grants)
  const ask = (departmentId: string | null, extra: { coordinating?: boolean; ownerId?: string } = {}) =>
    grantedBy(overrides, holder, cap, { departmentId, ...extra }, teamRules)

  // Overwatch's cells (0214) are what overwatch_may() reads, not may(), so
  // they are added here as usePermissions adds them. Posting on the board
  // is as themselves, never as a team.
  const act = overwatchActOf(cap)
  const reads = OVERWATCH_READS[cap]
  const watched =
    person.overwatch &&
    ((act && overwatchMay(overrides, settings.overwatch_pages, act)) ||
      (!!reads && overwatchOpens(reads, settings.overwatch_pages)))
      ? ('overwatch' as const)
      : null
  if (isOverwatchOnly(cap)) return watched ? { kind: 'everywhere', via: 'overwatch' } : { kind: 'none' }

  const church: Via | null = ask(null) ?? watched
  const perTeam = teamIds.map((id) => ({
    id,
    via: (ask(id, { coordinating: person.coordinatorTeams.includes(id) }) ??
      (act === 'board' ? null : watched)) as Via | null,
  }))
  const granted = perTeam.filter((t): t is { id: string; via: Via } => t.via !== null)

  if (church && granted.length === perTeam.length) return { kind: 'everywhere', via: church }
  if (granted.length > 0) return { kind: 'teams', teams: granted, church }
  if (church) return { kind: 'everywhere', via: church }
  const own = ask(null, { ownerId: person.id })
  if (own) return { kind: 'own', via: own }
  return { kind: 'none' }
}

const RANK: Record<Allowed, number> = { no: 0, own: 1, team: 2, yes: 3 }

/** The profiles a person holds, widest first, as the grid's columns name them. */
export function profilesOf(p: PersonFacts): RoleKey[] {
  const out: RoleKey[] = []
  if (p.owner) out.push('owner')
  if (p.admin) out.push('admin')
  if (p.overwatch) out.push('overwatch')
  if (p.pastor) out.push('pastor')
  if (p.headTeams.length > 0) out.push('head')
  if (p.assistTeams.length > 0) out.push('assistant')
  if (p.coordinatorTeams.length > 0) out.push('coordinator')
  if (p.memberTeams.length > 0) out.push('member')
  out.push('newcomer')
  return out
}

/**
 * A row the grid does not set (what anybody can see, your own things, the
 * keys to the app): the widest answer any profile they hold has, and
 * which profile that is.
 *
 * A row that is a page ("See the rota") follows whether the page opens to
 * them — `row` as withPageAccess() drew it — and Overwatch gets a yes
 * where the church left the page open to it.
 */
export function explainFixed(
  person: PersonFacts,
  row: Capability,
  settings?: AppSettings,
): { allowed: Allowed; via: Via | null } {
  let best: { allowed: Allowed; via: Via | null } = { allowed: 'no', via: null }
  for (const profile of profilesOf(person)) {
    const allowed = row.can[profile]
    if (RANK[allowed] > RANK[best.allowed]) best = { allowed, via: profile }
  }
  if (row.page && settings) {
    const opening = openingFor(person, row.page, settings)
    if (!opening.open) return { allowed: 'no', via: null }
    if (best.allowed === 'no' && opening.via === 'overwatch') return { allowed: 'yes', via: 'overwatch' }
  }
  return best
}

/**
 * Whether a page opens to this person, and why. `granted` is the grid's
 * answer, grants included, for the two pages that open by a capability as
 * well as by their level: Clock In (0209) and Prayer (0210).
 */
export function openingFor(
  person: PersonFacts,
  path: string,
  settings: AppSettings,
  granted: { clockInViewer?: boolean; prayerCarer?: boolean } = {},
): PageOpening {
  const led = [...person.headTeams, ...person.assistTeams]
  const onATeam = person.memberTeams.length > 0 || led.length > 0 || person.admin
  return pageOpening(
    path,
    {
      myId: person.id,
      // As usePageAccess: Overwatch counts as on a team only where it
      // really is on a roster, or the pages the church closed to it would
      // open anyway.
      standing: standingOf({
        isAdmin: person.admin || person.owner,
        isLead: led.length > 0,
        onATeam: person.overwatch && !person.admin ? person.memberTeams.length > 0 || led.length > 0 : onATeam,
      }),
      isAdmin: person.admin,
      isOwner: person.owner,
      isOverwatch: person.overwatch,
      isPastor: person.pastor,
      teamIds: [...person.memberTeams, ...led],
      clockInViewer: !!granted.clockInViewer,
      prayerCarer: !!granted.prayerCarer,
    },
    settings,
  )
}

/** A grant that reaches this person, and whether by name or through a team. */
export interface HeldGrant {
  grant: PermissionGrant
  /** Their own, by name; else the team that carries it to them. */
  teamId: string | null
}

/** The church's grants that reach this person (0208): theirs by name, then their teams'. */
export function grantsFor(person: PersonFacts, grants: readonly PermissionGrant[]): HeldGrant[] {
  const leads = new Set([...person.headTeams, ...person.assistTeams])
  const onTeams = new Set([...person.memberTeams, ...leads])
  return [
    ...grants.filter((g) => g.userId === person.id).map((grant) => ({ grant, teamId: null })),
    ...grants
      .filter((g) => !!g.departmentId && (g.leadsOnly ? leads : onTeams).has(g.departmentId))
      .map((grant) => ({ grant, teamId: grant.departmentId })),
  ]
}

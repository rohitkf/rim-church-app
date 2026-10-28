import type { AppSettings } from './appSettings'
import type { PersonEntry } from './peopleFacts'
import { placesFor } from './personAccess'
import type { CapabilityKey, Overrides, PermissionChange, PermissionGrant, TeamOverrides } from './permissions'

/**
 * What a change to the grid would do, before it is saved: for each action
 * it touches, who could then do more of it and who less — "this lets six
 * people change answers in Worship".
 *
 * It asks the same question By person does (`placesFor()`, under
 * `explainCapability()`: `decide()` with the teams' rules, grants and
 * Overwatch's cells), of everybody, once with the grid as saved and once
 * as drafted, place by place — where no team is involved, each team, and
 * their own. Somebody gains a place, or loses one; somebody who does both
 * is named under each. The Owner holds everything either way, so never
 * appears.
 */

/** The grid as it is, or as it would be: the church's cells, the teams' own (0162) and the grants (0208). */
export interface GridState {
  church: Overrides
  teams: TeamOverrides
  grants: readonly PermissionGrant[]
}

/** One action's effect: who gains, who loses, by name. */
export interface ChangeEffect {
  capability: CapabilityKey
  more: PersonEntry[]
  less: PersonEntry[]
}

/** Every place somebody may do it: "church", a team's id, or "own". */
function placesOf(...args: Parameters<typeof placesFor>): Set<string> {
  const { church, perTeam, own } = placesFor(...args)
  const out = new Set<string>()
  if (church) out.add('church')
  for (const t of perTeam) if (t.via) out.add(t.id)
  if (own || church) out.add('own')
  return out
}

/** The actions a list of changes touches, each once, in the order first touched. */
export function capabilitiesIn(changes: readonly PermissionChange[]): CapabilityKey[] {
  return [...new Set(changes.map((c) => c.capability))]
}

/** For each action touched, who could do more of it, and who less. */
export function changeEffects(
  people: readonly PersonEntry[],
  before: GridState,
  after: GridState,
  touched: readonly CapabilityKey[],
  teamIds: readonly string[],
  settings: AppSettings,
): ChangeEffect[] {
  return touched.map((capability) => {
    const more: PersonEntry[] = []
    const less: PersonEntry[] = []
    for (const person of people) {
      if (person.facts.owner) continue
      const was = placesOf(person.facts, capability, before.church, before.teams, teamIds, settings, before.grants)
      const now = placesOf(person.facts, capability, after.church, after.teams, teamIds, settings, after.grants)
      if ([...now].some((p) => !was.has(p))) more.push(person)
      if ([...was].some((p) => !now.has(p))) less.push(person)
    }
    return { capability, more, less }
  })
}

/** A few names, and how many more: "Asha Mathew, Ben Joseph and 4 more". */
export function namesOf(people: readonly PersonEntry[], shown = 3): string {
  const names = people.slice(0, shown).map((p) => p.name)
  const rest = people.length - names.length
  if (rest > 0) return `${names.join(', ')} and ${rest} more`
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

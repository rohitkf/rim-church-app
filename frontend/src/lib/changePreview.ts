import type { AppSettings } from './appSettings'
import type { PersonEntry } from './peopleFacts'
import { explainCapability, type Answer } from './personAccess'
import type { CapabilityKey, Overrides, PermissionChange, PermissionGrant, TeamOverrides } from './permissions'

/**
 * What a change to the grid would do, before it is saved: for each action
 * it touches, who could then do more of it and who less — "this lets six
 * people change answers in Worship".
 *
 * It asks the same question By person does (`explainCapability()`, which
 * is `decide()` with the teams' rules, grants and Overwatch's cells), of
 * everybody, once with the grid as saved and once as drafted. The Owner
 * holds everything either way, so never appears.
 */

/** The grid as it is, or as it would be. */
export interface GridState {
  church: Overrides
  teams: TeamOverrides
}

/** One action's effect: who gains, who loses, by name. */
export interface ChangeEffect {
  capability: CapabilityKey
  more: PersonEntry[]
  less: PersonEntry[]
}

/** How far an answer reaches, as a number to compare: nothing, their own, some teams, everywhere. */
function breadth(answer: Answer): number {
  switch (answer.kind) {
    case 'none':
      return 0
    case 'own':
      return 1
    case 'teams':
      return 2 + answer.teams.length + (answer.church ? 0.5 : 0)
    case 'everywhere':
      return 10_000
  }
}

/** The actions a list of changes touches, each once, in the order first touched. */
export function capabilitiesIn(changes: readonly PermissionChange[]): CapabilityKey[] {
  return [...new Set(changes.map((c) => c.capability))]
}

/** For each action the changes touch, who could do more of it, and who less. */
export function changeEffects(
  people: readonly PersonEntry[],
  before: GridState,
  after: GridState,
  changes: readonly PermissionChange[],
  teamIds: readonly string[],
  settings: AppSettings,
  grants: readonly PermissionGrant[] = [],
): ChangeEffect[] {
  return capabilitiesIn(changes).map((capability) => {
    const more: PersonEntry[] = []
    const less: PersonEntry[] = []
    for (const person of people) {
      if (person.facts.owner) continue
      const was = breadth(explainCapability(person.facts, capability, before.church, before.teams, teamIds, settings, grants))
      const now = breadth(explainCapability(person.facts, capability, after.church, after.teams, teamIds, settings, grants))
      if (now > was) more.push(person)
      else if (now < was) less.push(person)
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

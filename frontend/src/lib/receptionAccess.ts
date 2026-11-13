import type { CapabilityKey, PermissionGrant } from './permissions'

/**
 * Who works Reception, and which of its buttons each has (0251, 0267).
 *
 * The door's rights are ordinary capabilities, given to a team (everybody
 * on it, and its Heads) or to a person by name as grants (0208) — the
 * same rows Access & Privileges › By person and By team write. Settings ›
 * Reception edits them as holders and ticks, because that is how the
 * question is asked: "who is on the door on Saturday, and may they take
 * money?"
 *
 * The keys are the grid's, word for word; the database decides
 * (`registration_can`), this only says what to draw and what to save.
 */
export const RECEPTION_BUTTONS = [
  { key: 'reg.door', label: 'Check people in', hint: 'Scan or find a ticket, check it in, and undo a check-in' },
  { key: 'reg.door_pay', label: 'Take payments at the door', hint: 'Mark a registration paid at Reception' },
  { key: 'reg.walk_in', label: 'Register walk-ins', hint: 'Sign up somebody who turns up without a ticket' },
  { key: 'reg.door_view', label: 'See Reception, read only', hint: 'The list and the counts, with nothing to press' },
] as const satisfies readonly { key: CapabilityKey; label: string; hint: string }[]

export type ReceptionButton = (typeof RECEPTION_BUTTONS)[number]['key']

export const RECEPTION_KEYS = RECEPTION_BUTTONS.map((b) => b.key) as [ReceptionButton, ...ReceptionButton[]]

/** What somebody new starts with: checking people in, and no money. */
export const NEW_DOOR_HOLDER: readonly ReceptionButton[] = ['reg.door']

export interface ReceptionAccess {
  /** A team's id to what everybody on it, and its Heads, may press. */
  teams: Record<string, ReceptionButton[]>
  /** A profile's id to what that person may press. */
  people: Record<string, ReceptionButton[]>
}

export type DoorHolderKind = keyof ReceptionAccess

const isButton = (cap: string): cap is ReceptionButton => (RECEPTION_KEYS as readonly string[]).includes(cap)
const inOrder = (list: readonly ReceptionButton[]) => RECEPTION_KEYS.filter((k) => list.includes(k))

/** The holders and their buttons, as the church's grants say them. */
export function receptionFromGrants(grants: readonly PermissionGrant[]): ReceptionAccess {
  const out: ReceptionAccess = { teams: {}, people: {} }
  for (const g of grants) {
    if (!isButton(g.capability)) continue
    const [kind, id] = g.departmentId ? (['teams', g.departmentId] as const) : (['people', g.userId] as const)
    if (!id) continue
    out[kind][id] = inOrder([...(out[kind][id] ?? []), g.capability])
  }
  return out
}

export interface ReceptionGrantChange {
  capability: ReceptionButton
  team?: string
  person?: string
  reach: 'all' | null
}

/** The grants to give and take back to turn `stored` into `next`, for set_permission_grants(). */
export function receptionGrantChanges(stored: ReceptionAccess, next: ReceptionAccess): ReceptionGrantChange[] {
  const changes: ReceptionGrantChange[] = []
  for (const kind of ['teams', 'people'] as const) {
    const who = (id: string) => (kind === 'teams' ? { team: id } : { person: id })
    const ids = new Set([...Object.keys(stored[kind]), ...Object.keys(next[kind])])
    for (const id of ids) {
      const was = stored[kind][id] ?? []
      const now = next[kind][id] ?? []
      for (const k of RECEPTION_KEYS) {
        if (now.includes(k) && !was.includes(k)) changes.push({ capability: k, ...who(id), reach: 'all' })
        if (was.includes(k) && !now.includes(k)) changes.push({ capability: k, ...who(id), reach: null })
      }
    }
  }
  return changes
}

/** The same access with one holder's buttons set, or the holder gone (null). */
export function withDoorHolder(
  access: ReceptionAccess,
  kind: DoorHolderKind,
  id: string,
  next: readonly ReceptionButton[] | null,
): ReceptionAccess {
  const group = { ...access[kind] }
  if (next === null) delete group[id]
  else group[id] = inOrder(next)
  return { ...access, [kind]: group }
}

/** Ticks one button on or off for one holder. */
export function toggleDoorButton(access: ReceptionAccess, kind: DoorHolderKind, id: string, button: ReceptionButton): ReceptionAccess {
  const now = access[kind][id] ?? []
  return withDoorHolder(access, kind, id, now.includes(button) ? now.filter((b) => b !== button) : [...now, button])
}

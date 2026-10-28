import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { PermissionGrant } from './permissions'

/**
 * The Service Planner's buttons, given to a team or a person (0184).
 *
 * Whoever may plan the running order (`svc.sessions`) or run the service
 * (`svc.manage`) has every button, as before. The church can also give
 * some of them — and only those — to a team (everybody on it, and its
 * Heads) or to named people: the person at the desk on a Sunday can press
 * "Session started" and "Add time" without being able to rename, reorder
 * or delete the plan.
 *
 * The database holds it (`planner_control()`, the guards on each table);
 * this only decides which buttons are worth drawing. The keys are the
 * migration's, word for word.
 */
export const PLANNER_CONTROLS = [
  { key: 'start', label: 'Session started', hint: 'Sets a session to now and moves the rest' },
  { key: 'hold', label: 'Not started', hint: 'Holds a start until the one before it finishes' },
  { key: 'add_time', label: 'Add time', hint: 'Grants extra minutes and moves the rest down' },
  { key: 'skip', label: 'Skip', hint: 'Takes a session out of the order, and puts it back' },
  { key: 'substitute', label: 'Assign substitute', hint: 'Names who steps in for a session' },
  { key: 'add_below', label: 'Add a session below', hint: 'A new session under one already there' },
  { key: 'remove', label: 'Remove a session', hint: 'Deletes it; the ones after move up' },
  { key: 'end', label: 'End service', hint: 'Records when it finished, and reopens it' },
] as const

export type PlannerControl = (typeof PLANNER_CONTROLS)[number]['key']

export const CONTROL_KEYS = PLANNER_CONTROLS.map((c) => c.key) as [PlannerControl, ...PlannerControl[]]

/** The buttons that move the running order while it runs. */
export const RUN_CONTROLS: readonly PlannerControl[] = ['start', 'hold', 'add_time', 'skip']

/** What a new holder starts with: running the order, nothing that reshapes it. */
export const NEW_HOLDER: readonly PlannerControl[] = RUN_CONTROLS

export interface PlannerControls {
  /** A team's id to what everybody on it, and its Heads, may press. */
  teams: Record<string, PlannerControl[]>
  /** A profile's id to what that person may press. */
  people: Record<string, PlannerControl[]>
}

export const NO_CONTROLS: PlannerControls = { teams: {}, people: {} }

// A control this app does not know (a newer one, an older one gone) is
// dropped rather than failing the whole settings row.
const given = z
  .array(z.unknown())
  .transform((list) => list.filter((c): c is PlannerControl => CONTROL_KEYS.includes(c as PlannerControl)))
const holders = z.record(z.string(), given.catch([])).catch({})

export const plannerControlsSchema = z
  .object({ teams: holders.default({}), people: holders.default({}) })
  .catch({ teams: {}, people: {} })

export type HolderKind = keyof PlannerControls

/**
 * The holders and their buttons, as the church's grants say them (0211):
 * each button is a capability, `planner.<key>`, given to a team or a
 * person. The room still edits it as holders and ticks.
 */
export function controlsFromGrants(grants: readonly PermissionGrant[]): PlannerControls {
  const out: PlannerControls = { teams: {}, people: {} }
  for (const g of grants) {
    if (!g.capability.startsWith('planner.')) continue
    const control = g.capability.slice('planner.'.length) as PlannerControl
    if (!CONTROL_KEYS.includes(control)) continue
    const [kind, id] = g.departmentId ? (['teams', g.departmentId] as const) : (['people', g.userId] as const)
    if (!id) continue
    out[kind][id] = CONTROL_KEYS.filter((c) => c === control || (out[kind][id] ?? []).includes(c))
  }
  return out
}

/** The grants to give and take back to turn `stored` into `next`, for set_permission_grants(). */
export function controlGrantChanges(
  stored: PlannerControls,
  next: PlannerControls,
): { capability: string; team?: string; person?: string; reach: 'all' | null }[] {
  const changes: { capability: string; team?: string; person?: string; reach: 'all' | null }[] = []
  for (const kind of ['teams', 'people'] as const) {
    const who = (id: string) => (kind === 'teams' ? { team: id } : { person: id })
    const ids = new Set([...Object.keys(stored[kind]), ...Object.keys(next[kind])])
    for (const id of ids) {
      const was = stored[kind][id] ?? []
      const now = next[kind][id] ?? []
      for (const c of CONTROL_KEYS) {
        if (now.includes(c) && !was.includes(c)) changes.push({ capability: `planner.${c}`, ...who(id), reach: 'all' })
        if (was.includes(c) && !now.includes(c)) changes.push({ capability: `planner.${c}`, ...who(id), reach: null })
      }
    }
  }
  return changes
}

/** Everything this person may press, on their own name or through a team they are on or head. */
export function controlsHeld(
  controls: PlannerControls,
  me: { id?: string | null; teamIds: readonly string[] },
): Set<PlannerControl> {
  const held = new Set<PlannerControl>()
  if (me.id) for (const c of controls.people[me.id] ?? []) held.add(c)
  for (const team of me.teamIds) for (const c of controls.teams[team] ?? []) held.add(c)
  return held
}

/** The same settings with one holder's buttons set, or the holder gone (null). */
export function withHolder(
  controls: PlannerControls,
  kind: HolderKind,
  id: string,
  next: readonly PlannerControl[] | null,
): PlannerControls {
  const group = { ...controls[kind] }
  if (next === null) delete group[id]
  // In the order the menu draws them, whatever order they were ticked in.
  else group[id] = CONTROL_KEYS.filter((c) => next.includes(c))
  return { ...controls, [kind]: group }
}

/** Ticks one button on or off for one holder. */
export function toggleControl(
  controls: PlannerControls,
  kind: HolderKind,
  id: string,
  control: PlannerControl,
): PlannerControls {
  const now = controls[kind][id] ?? []
  return withHolder(controls, kind, id, now.includes(control) ? now.filter((c) => c !== control) : [...now, control])
}

export interface PersonOption {
  id: string
  first_name: string
  last_name: string
}

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })

/** Everybody with an account: a control needs someone to sign in. */
export async function fetchPeopleOptions(): Promise<PersonOption[]> {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

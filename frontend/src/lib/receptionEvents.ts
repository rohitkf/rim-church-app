import { z } from 'zod'
import type { DoorHolderKind } from './receptionAccess'
import { supabase } from './supabaseClient'

/**
 * Reception for some events only (0313).
 *
 * Whoever is on Reception had it for every event the church runs. Each
 * holder — a person, or a team — can now be kept to the events chosen for
 * them. Nothing chosen is every event, which is how everybody starts and
 * how it was before.
 *
 * The database decides (`reception_limited_events`, asked by every row
 * rule and every one of the door's functions); this is what Settings ›
 * Reception reads, draws and saves. The table itself is closed: it is read
 * through `reception_event_limits_state()`, which also names the events to
 * choose from, for somebody who may change the ticks and yet has no
 * registrations right to read the events with.
 */

export const RECEPTION_EVENTS_KEY = ['reception-event-limits']

const stateSchema = z.object({
  limits: z.array(z.object({ user_id: z.string().nullable(), department_id: z.string().nullable(), event_ids: z.array(z.string()) })),
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      cancelled: z.boolean(),
      starts_at: z.string().nullable(),
      ends_at: z.string().nullable(),
    }),
  ),
})

export type ReceptionEventChoice = z.infer<typeof stateSchema>['events'][number]

/** A holder's key to the events it is kept to. A holder with no key has every event. */
export type ReceptionEventLimits = Record<string, string[]>

export const holderKey = (kind: DoorHolderKind, id: string) => `${kind}:${id}`

export async function fetchReceptionEvents(): Promise<{ limits: ReceptionEventLimits; events: ReceptionEventChoice[] }> {
  const { data, error } = await supabase.rpc('reception_event_limits_state')
  if (error) throw error
  const state = stateSchema.parse(data)
  const limits: ReceptionEventLimits = {}
  for (const l of state.limits) {
    if (l.user_id) limits[holderKey('people', l.user_id)] = l.event_ids
    else if (l.department_id) limits[holderKey('teams', l.department_id)] = l.event_ids
  }
  return { limits, events: state.events }
}

export interface ReceptionEventChange {
  person?: string
  team?: string
  /** The events to keep them to, or null for every event again. */
  events: string[] | null
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * What to send to set_reception_event_limits() to turn `stored` into
 * `next`, for the holders there still are.
 *
 * A holder taken off Reception is left out: the database drops their limit
 * with their last tick, and would refuse a limit for somebody who is not
 * on Reception.
 */
export function receptionEventChanges(stored: ReceptionEventLimits, next: ReceptionEventLimits, holders: readonly string[]): ReceptionEventChange[] {
  const changes: ReceptionEventChange[] = []
  for (const key of holders) {
    const was = stored[key]
    const now = next[key]
    if (was === undefined && now === undefined) continue
    if (was !== undefined && now !== undefined && sameSet(was, now)) continue
    const [kind, id] = key.split(':') as [DoorHolderKind, string]
    changes.push({ ...(kind === 'teams' ? { team: id } : { person: id }), events: now ?? null })
  }
  return changes
}

export async function saveReceptionEvents(changes: ReceptionEventChange[]): Promise<void> {
  if (changes.length === 0) return
  const { error } = await supabase.rpc('set_reception_event_limits', { p_changes: changes })
  if (error) throw error
}

/** The same limits with one holder kept to these events, or given every event again (null). */
export function withEventLimit(limits: ReceptionEventLimits, key: string, events: readonly string[] | null): ReceptionEventLimits {
  const next = { ...limits }
  if (events === null) delete next[key]
  else next[key] = [...events]
  return next
}

/** Ticks one event on or off for a holder who is kept to chosen events. */
export function toggleEvent(limits: ReceptionEventLimits, key: string, eventId: string): ReceptionEventLimits {
  const now = limits[key] ?? []
  return withEventLimit(limits, key, now.includes(eventId) ? now.filter((id) => id !== eventId) : [...now, eventId])
}

/**
 * "22 Nov 2026", or "20 – 21 Nov 2026" for an event of several days, in
 * the order the device writes dates; nothing for one with no date yet.
 *
 * The range is the platform's own (`formatRange`): a first version put a
 * bare day in front of the last date, which read "12 – Feb 14, 2027" on a
 * phone that writes the month first.
 */
export function eventDays(event: Pick<ReceptionEventChoice, 'starts_at' | 'ends_at'>, locale?: string): string | null {
  if (!event.starts_at) return null
  const first = new Date(event.starts_at)
  const last = new Date(event.ends_at ?? event.starts_at)
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  if (first.toDateString() === last.toDateString()) return format.format(first)
  return format.formatRange(first, last)
}

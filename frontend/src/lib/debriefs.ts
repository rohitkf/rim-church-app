import { z } from 'zod'
import { supabase } from './supabaseClient'
import { addDays, dayCount } from './dateRange'

/**
 * What a team said after the service, and how long it is kept.
 *
 * Every team talks after a Sunday — what ran late, what nobody could hear,
 * who needs showing how to do the thing that went wrong. Written down, that
 * conversation reaches the head who was away and carries into next week.
 * Left in four WhatsApp groups it does neither.
 *
 * They expire on purpose. Minutes are working notes: they say "the radio
 * mic was dead again" and name the person who forgot the batteries. Kept
 * for ever that is a file on somebody; kept for a month it is a team
 * remembering last Sunday, which is all anybody wanted. The database does
 * the deleting nightly — this is only how the page says when.
 */

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
})

/**
 * One thing said in the debrief.
 *
 * A line, optionally on somebody, and tickable. `done_at` is the whole of
 * "has it been dealt with" — a null there is the item still outstanding,
 * which is what next Sunday needs to know.
 */
export const debriefItemSchema = z.object({
  id: z.string(),
  debrief_id: z.string(),
  body: z.string(),
  assigned_to: z.string().nullable(),
  done_at: z.string().nullable(),
  done_by: z.string().nullable(),
  sort_order: z.number(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  updated_at: z.string(),
  assignee: personSchema.nullable().optional(),
})
export type DebriefItem = z.infer<typeof debriefItemSchema>

export const debriefSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  // Superseded by the items. Still read so minutes typed by the previous
  // build are not silently dropped off the page.
  minutes: z.string().nullable().optional(),
  written_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  author: personSchema.nullable().optional(),
  items: z.array(debriefItemSchema).optional(),
})
export type Debrief = z.infer<typeof debriefSchema>

export const DEBRIEFS_KEY = ['service-debriefs']

export async function fetchDebriefs(serviceIds: string[]): Promise<Debrief[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('service_debriefs')
    .select(
      '*, author:profiles!service_debriefs_written_by_fkey(id, first_name, last_name), ' +
        'items:service_debrief_items(*, assignee:profiles!service_debrief_items_assigned_to_fkey(id, first_name, last_name))',
    )
    .in('service_id', serviceIds)
  if (error) throw error
  return z.array(debriefSchema).parse(data).map((d) => ({ ...d, items: sortItems(d.items ?? []) }))
}

/**
 * The order a team reads their own list back in.
 *
 * The order they were said in, and then — because a debrief is worked
 * through rather than admired — whatever is still outstanding above
 * whatever is done.
 */
export function sortItems(items: DebriefItem[]): DebriefItem[] {
  return [...items].sort((a, b) => {
    const doneDiff = Number(!!a.done_at) - Number(!!b.done_at)
    if (doneDiff !== 0) return doneDiff
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.created_at.localeCompare(b.created_at)
  })
}

/** How much of a team's list is dealt with, for the line that says so. */
export function itemProgress(items: DebriefItem[]): { done: number; total: number } {
  return { done: items.filter((i) => !!i.done_at).length, total: items.length }
}

/**
 * When a service's minutes stop being kept.
 *
 * Midnight at the end of the last day, counted from the service's own date
 * — so a team writing theirs up on the Thursday does not buy itself four
 * extra days, and every team's minutes for one Sunday go together. Mirrors
 * `debrief_expires_at` in the database, which is the one that actually
 * deletes; this only says so on the page.
 */
export function debriefExpiresAt(serviceDate: string, retentionDays: number): Date {
  return new Date(`${addDays(serviceDate, retentionDays + 1)}T00:00:00`)
}

/** Whole days left, for the sentence that says how long is left. */
export function daysLeft(serviceDate: string, retentionDays: number, today: string): number {
  const lastDay = addDays(serviceDate, retentionDays)
  if (today > lastDay) return 0
  return dayCount(today, lastDay)
}

/** Whether there is anything left to keep. */
export function isExpired(serviceDate: string, retentionDays: number, today: string): boolean {
  return daysLeft(serviceDate, retentionDays, today) === 0
}

/**
 * The row that holds a team's items, made on the way past.
 *
 * Nobody sets out to "create a debrief" — they type the first thing that
 * went wrong and press Add. So the container is created by the first item
 * that needs one, and the head who added it is the name on it.
 */
async function debriefIdFor(fields: {
  debriefId: string | null
  serviceId: string
  departmentId: string
  writtenBy: string
}): Promise<string> {
  if (fields.debriefId) return fields.debriefId
  const { data, error } = await supabase
    .from('service_debriefs')
    .insert({
      service_id: fields.serviceId,
      department_id: fields.departmentId,
      written_by: fields.writtenBy,
    })
    .select('id')
    .single()
  if (error) throw error
  return z.object({ id: z.string() }).parse(data).id
}

export async function addDebriefItem(fields: {
  debriefId: string | null
  serviceId: string
  departmentId: string
  body: string
  assignedTo: string | null
  createdBy: string
  sortOrder: number
}): Promise<void> {
  const body = fields.body.trim()
  if (!body) return
  // Whoever adds the first item is whose name goes on the debrief.
  const debriefId = await debriefIdFor({ ...fields, writtenBy: fields.createdBy })
  const { error } = await supabase.from('service_debrief_items').insert({
    debrief_id: debriefId,
    body,
    assigned_to: fields.assignedTo,
    sort_order: fields.sortOrder,
    created_by: fields.createdBy,
  })
  if (error) throw error
}

export async function updateDebriefItem(
  id: string,
  fields: { body: string; assignedTo: string | null },
): Promise<void> {
  const body = fields.body.trim()
  if (!body) return
  const { error } = await supabase
    .from('service_debrief_items')
    .update({ body, assigned_to: fields.assignedTo })
    .eq('id', id)
  if (error) throw error
}

/**
 * Ticking one off, and putting it back.
 *
 * Both directions matter: an item ticked by mistake that cannot be
 * un-ticked teaches people not to tick anything.
 */
export async function setDebriefItemDone(
  id: string,
  done: boolean,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('service_debrief_items')
    .update(
      done ? { done_at: new Date().toISOString(), done_by: userId } : { done_at: null, done_by: null },
    )
    .eq('id', id)
  if (error) throw error
}

export async function deleteDebriefItem(id: string): Promise<void> {
  const { error } = await supabase.from('service_debrief_items').delete().eq('id', id)
  if (error) throw error
}

/** The number a newly added item sorts after. */
export function nextSortOrder(items: DebriefItem[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.sort_order), -1) + 1
}

export async function deleteDebrief(id: string): Promise<void> {
  const { error } = await supabase.from('service_debriefs').delete().eq('id', id)
  if (error) throw error
}

/** The minutes for one team on one service, if anybody has written them. */
export function debriefFor(
  debriefs: Debrief[],
  serviceId: string,
  departmentId: string,
): Debrief | null {
  return (
    debriefs.find((d) => d.service_id === serviceId && d.department_id === departmentId) ?? null
  )
}

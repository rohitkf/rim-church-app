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

export const debriefSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  minutes: z.string(),
  written_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  author: z
    .object({ id: z.string(), first_name: z.string(), last_name: z.string() })
    .nullable()
    .optional(),
})
export type Debrief = z.infer<typeof debriefSchema>

export const DEBRIEFS_KEY = ['service-debriefs']

export async function fetchDebriefs(serviceIds: string[]): Promise<Debrief[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('service_debriefs')
    .select('*, author:profiles!service_debriefs_written_by_fkey(id, first_name, last_name)')
    .in('service_id', serviceIds)
  if (error) throw error
  return z.array(debriefSchema).parse(data)
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

export async function saveDebrief(fields: {
  id: string | null
  serviceId: string
  departmentId: string
  minutes: string
  writtenBy: string
}): Promise<void> {
  const minutes = fields.minutes.trim()
  if (fields.id) {
    // The author is left as whoever wrote them: a head correcting a typo in
    // their assisting head's minutes has not taken them over.
    const { error } = await supabase
      .from('service_debriefs')
      .update({ minutes })
      .eq('id', fields.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('service_debriefs').insert({
    service_id: fields.serviceId,
    department_id: fields.departmentId,
    minutes,
    written_by: fields.writtenBy,
  })
  if (error) throw error
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

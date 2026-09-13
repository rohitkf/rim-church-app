import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { AvailabilityStatus } from './types'

/**
 * Asking to change your answer once the window has shut.
 *
 * The deadline is the night before, and it is a real one: the database
 * refuses an answer after it, because a head planning a Sunday morning
 * needs the answers settled while there is still an evening to do
 * something about them.
 *
 * But a child is ill at seven in the morning, and a cancelled meeting
 * frees somebody up. The door is shut, not walled up: after the deadline
 * a member asks, and the team's head or assisting head — or an Admin —
 * approves or rejects. Nothing moves on the asking. The answer changes
 * when somebody approves it, which is the whole difference between this
 * and simply leaving the window open.
 */

export const availabilityRequestSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  requested_status: z.enum(['available', 'unavailable', 'tentative']),
  reason: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  decision_note: z.string().nullable(),
  created_at: z.string(),
  /** Who is asking — joined, so a head sees a name rather than an id. */
  asker: z
    .object({ id: z.string(), first_name: z.string(), last_name: z.string() })
    .nullable()
    .optional(),
})
export type AvailabilityRequest = z.infer<typeof availabilityRequestSchema>

export const AVAILABILITY_REQUESTS_KEY = ['availability-requests']

export async function fetchAvailabilityRequests(
  serviceIds: string[],
): Promise<AvailabilityRequest[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('availability_change_requests')
    .select(
      '*, asker:profiles!availability_change_requests_user_id_fkey(id, first_name, last_name)',
    )
    .in('service_id', serviceIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(availabilityRequestSchema).parse(data)
}

/** Raise one for yourself. The database checks that the window is shut. */
export async function askToChangeAnswer(fields: {
  userId: string
  serviceId: string
  departmentId: string
  status: AvailabilityStatus
  reason: string | null
}): Promise<void> {
  const { error } = await supabase.from('availability_change_requests').insert({
    user_id: fields.userId,
    service_id: fields.serviceId,
    department_id: fields.departmentId,
    requested_status: fields.status,
    reason: fields.reason?.trim() || null,
  })
  if (error) throw error
}

/**
 * A head's answer. Approving is what writes the availability row — a
 * trigger does it, because by now nobody is allowed to write that row by
 * hand, which is the point of the deadline.
 */
export async function decideAvailabilityRequest(fields: {
  id: string
  approve: boolean
  decidedBy: string
  note?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('availability_change_requests')
    .update({
      status: fields.approve ? 'approved' : 'rejected',
      decided_by: fields.decidedBy,
      decided_at: new Date().toISOString(),
      decision_note: fields.note?.trim() || null,
    })
    .eq('id', fields.id)
  if (error) throw error
}

/** Take back an ask nobody has answered yet. */
export async function withdrawAvailabilityRequest(id: string): Promise<void> {
  const { error } = await supabase.from('availability_change_requests').delete().eq('id', id)
  if (error) throw error
}

/** The one still waiting on somebody, for this person on this team. */
export function pendingFor(
  requests: AvailabilityRequest[],
  userId: string,
  serviceId: string,
  departmentId: string,
): AvailabilityRequest | null {
  return (
    requests.find(
      (r) =>
        r.status === 'pending' &&
        r.user_id === userId &&
        r.service_id === serviceId &&
        r.department_id === departmentId,
    ) ?? null
  )
}

/** Everything waiting on a decision from whoever leads this team. */
export function pendingOn(
  requests: AvailabilityRequest[],
  serviceId: string,
  departmentId: string,
): AvailabilityRequest[] {
  return requests.filter(
    (r) => r.status === 'pending' && r.service_id === serviceId && r.department_id === departmentId,
  )
}

/**
 * The last thing that happened to this person's ask, once it is no longer
 * pending — so somebody coming back to the page is told the answer rather
 * than finding their request has silently vanished.
 */
export function settledFor(
  requests: AvailabilityRequest[],
  userId: string,
  serviceId: string,
  departmentId: string,
): AvailabilityRequest | null {
  return (
    requests.find(
      (r) =>
        r.status !== 'pending' &&
        r.user_id === userId &&
        r.service_id === serviceId &&
        r.department_id === departmentId,
    ) ?? null
  )
}

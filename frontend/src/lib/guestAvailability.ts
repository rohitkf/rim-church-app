import { z } from 'zod'
import { supabase } from './supabaseClient'
import { availabilityStatusSchema, type AvailabilityRow, type AvailabilityStatus } from './types'
import type { AvailabilityHistoryEntry } from './availabilityHistory'

/*
 * Answers for the guest roll's people on a team (0166).
 *
 * Somebody with no account cannot answer for themselves, so whoever may
 * answer for others on that team does — by the same rules as anybody
 * else's answer. The page reads them as answers keyed by the guest's id,
 * which no account shares, so one list serves both kinds of person.
 */

const guestAnswerSchema = z.object({
  id: z.string(),
  guest_id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  status: availabilityStatusSchema,
  note: z.string().nullable(),
  updated_at: z.string(),
})

const guestHistorySchema = z.object({
  id: z.string(),
  guest_id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  kind: z.enum(['answered', 'changed', 'note', 'removed']),
  status: availabilityStatusSchema.nullable(),
  previous_status: availabilityStatusSchema.nullable(),
  note: z.string().nullable(),
  changed_by: z.string().nullable(),
  after_close: z.boolean().nullable(),
  changed_at: z.string(),
  changer: z.object({ first_name: z.string(), last_name: z.string() }).nullable().optional(),
})

const teamGuestSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  guest_id: z.string(),
  member_type: z.enum(['core', 'guest']),
  guests: z.object({ name: z.string() }).nullable().optional(),
})
export type TeamGuest = z.infer<typeof teamGuestSchema>

/** The roll's people on each of these teams. */
export async function fetchTeamGuests(departmentIds: string[]): Promise<TeamGuest[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_guests')
    .select('id, department_id, guest_id, member_type, guests(name)')
    .in('department_id', departmentIds)
  if (error) throw error
  return z.array(teamGuestSchema).parse(data ?? [])
}

/** Their answers, as answers keyed by the guest. Nobody marks them present. */
export async function fetchGuestAnswers(serviceIds: string[]): Promise<AvailabilityRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase.from('guest_availability').select('*').in('service_id', serviceIds)
  if (error) throw error
  return z
    .array(guestAnswerSchema)
    .parse(data ?? [])
    .map(({ guest_id, ...a }) => ({ ...a, user_id: guest_id, attended: null }))
}

/** How their answers changed, as lines of the same log. */
export async function fetchGuestAnswerHistory(serviceIds: string[]): Promise<AvailabilityHistoryEntry[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('guest_availability_history')
    .select('*, changer:profiles!guest_availability_history_changed_by_fkey(first_name, last_name)')
    .in('service_id', serviceIds)
    .order('changed_at')
  if (error) throw error
  return z
    .array(guestHistorySchema)
    .parse(data ?? [])
    .map(({ guest_id, ...e }) => ({ ...e, user_id: guest_id, by_request: false }))
}

/** Give, change or take away a guest's answer. */
export async function setGuestAnswer(fields: {
  answerId: string | null
  guestId: string
  serviceId: string
  departmentId: string
  status: AvailabilityStatus | null
}): Promise<void> {
  const { answerId, guestId, serviceId, departmentId, status } = fields
  if (status === null) {
    if (!answerId) return
    const { error } = await supabase.from('guest_availability').delete().eq('id', answerId)
    if (error) throw error
    return
  }
  if (answerId) {
    const { error } = await supabase.from('guest_availability').update({ status }).eq('id', answerId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('guest_availability')
    .insert({ guest_id: guestId, service_id: serviceId, department_id: departmentId, status })
  if (error) throw error
}

import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { AvailabilityRow, RotaAssignment } from './types'
import { fetchGuestAnswers } from './guestAvailability'

/*
 * Roles held by the guest roll's people on a team (0167).
 *
 * They have no account, so the rota page reads them as rota rows keyed
 * `guest:<id>` — a key no account shares — and every list on the page
 * (who is free, who already holds what) takes them like anybody else.
 * Their rows carry no checklist and no tags: a guest has nothing to tick.
 */

export const GUEST_PREFIX = 'guest:'
export const guestKey = (guestId: string) => `${GUEST_PREFIX}${guestId}`
export const isGuestKey = (key: string) => key.startsWith(GUEST_PREFIX)
export const guestIdOf = (key: string) => key.slice(GUEST_PREFIX.length)

export type RotaRow = RotaAssignment & { guest?: boolean }

const guestRotaSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  guest_id: z.string(),
  role_label: z.string(),
  role_id: z.string().nullable(),
  guest: z.object({ name: z.string() }).nullable(),
  department: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
})

export async function fetchGuestRota(serviceIds: string[]): Promise<RotaRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('guest_rota_assignments')
    .select('id, service_id, department_id, guest_id, role_label, role_id, guest:guests(name), department:departments(id, name, color)')
    .in('service_id', serviceIds)
  if (error) throw error
  return z
    .array(guestRotaSchema)
    .parse(data ?? [])
    .map((r) => ({
      id: r.id,
      service_id: r.service_id,
      department_id: r.department_id,
      user_id: guestKey(r.guest_id),
      role_label: r.role_label,
      role_id: r.role_id,
      include_pre: true,
      include_post: true,
      tags: [],
      profile: { id: guestKey(r.guest_id), first_name: r.guest?.name ?? 'Unknown', last_name: '' },
      department: r.department,
      guest: true,
    }))
}

/** Their answers, keyed the same way, for "who said yes". */
export async function fetchGuestAnswersForRota(serviceIds: string[]): Promise<AvailabilityRow[]> {
  return (await fetchGuestAnswers(serviceIds)).map((a) => ({ ...a, user_id: guestKey(a.user_id) }))
}

export async function assignGuestToRota(fields: {
  serviceId: string
  departmentId: string
  guestId: string
  roleLabel: string
  roleId: string | null
}): Promise<void> {
  const { error } = await supabase.from('guest_rota_assignments').insert({
    service_id: fields.serviceId,
    department_id: fields.departmentId,
    guest_id: fields.guestId,
    role_label: fields.roleLabel,
    role_id: fields.roleId,
  })
  if (error) throw error
}

export async function removeGuestFromRota(id: string): Promise<void> {
  const { error } = await supabase.from('guest_rota_assignments').delete().eq('id', id)
  if (error) throw error
}

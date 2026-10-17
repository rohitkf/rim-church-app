import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * The people who take part without an account.
 *
 * A visiting preacher should not need a login to be named against the
 * session they are taking — and, having come once, should not have to be
 * typed in again the next time. The roll belongs to the church rather
 * than to a service: one row per person, picked from wherever a name is
 * needed, until the day they have an account of their own.
 */
export const guestSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Pastor, Ps, Apostle, Br — however they are introduced. */
  title: z.string().nullable(),
  note: z.string().nullable(),
  /** Their profile, once they have one. */
  became_member: z.string().nullable(),
})
export type Guest = z.infer<typeof guestSchema>

export const GUESTS_KEY = ['guests']

/**
 * How a guest is written wherever they are named.
 *
 * The designation is part of how a church says somebody's name — "Pastor
 * Godlee" is not "Godlee" with a label attached — so it is printed in
 * front of it rather than shown as a badge beside it.
 */
export function guestLabel(guest: { name: string; title?: string | null }): string {
  const title = guest.title?.trim()
  return title ? `${title} ${guest.name}` : guest.name
}

export async function fetchGuests(): Promise<Guest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('id, name, title, note, became_member')
    .order('name')
  if (error) throw error
  return z.array(guestSchema).parse(data)
}

/**
 * The roll as a picker should offer it.
 *
 * Anybody who has since joined is left out: they are in the members list
 * now, and the same person twice in one picker is how a rota ends up half
 * assigned to a ghost.
 */
export function pickable(guests: Guest[]): Guest[] {
  return guests.filter((guest) => !guest.became_member)
}

export function useGuests() {
  return useQuery({ queryKey: GUESTS_KEY, queryFn: fetchGuests })
}

/**
 * Add somebody to the roll and hand back the row.
 *
 * Used by the quick add in the picker, where the whole point is that one
 * press turns a name nobody recognised into a person who can be assigned
 * — so it returns the guest rather than leaving the caller to go and look
 * for what it just made.
 */
export async function addGuest(fields: {
  name: string
  title?: string | null
  note?: string | null
}): Promise<Guest> {
  const { data, error } = await supabase
    .from('guests')
    .insert({
      name: fields.name.trim(),
      title: fields.title?.trim() || null,
      note: fields.note?.trim() || null,
    })
    .select('id, name, title, note, became_member')
    .single()
  if (error) throw error
  return guestSchema.parse(data)
}

/** Whether the roll already has this name, however it was capitalised. */
export function alreadyOnTheRoll(guests: Guest[], name: string): Guest | null {
  const needle = name.trim().toLowerCase()
  return guests.find((guest) => guest.name.trim().toLowerCase() === needle) ?? null
}

/* ------------------------------------------------------------------ *
 * A guest on a team (0161)
 * ------------------------------------------------------------------ */

/**
 * The roll's people on a team, core or guest, the same way an account
 * holder is — until they sign up and are linked, when the database moves
 * them across to `department_members`. They are on the rota and on the
 * page; they are not asked whether they can serve, there being nobody to
 * ask.
 */
export const departmentGuestSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  guest_id: z.string(),
  member_type: z.enum(['core', 'guest']),
  created_at: z.string(),
  guests: z.object({ id: z.string(), name: z.string(), title: z.string().nullable() }).nullable().optional(),
})
export type DepartmentGuest = z.infer<typeof departmentGuestSchema>

export const departmentGuestsKey = (departmentId: string) => ['department-guests', departmentId]

export async function fetchDepartmentGuests(departmentId: string): Promise<DepartmentGuest[]> {
  const { data, error } = await supabase
    .from('department_guests')
    .select('*, guests(id, name, title)')
    .eq('department_id', departmentId)
  if (error) throw error
  return z.array(departmentGuestSchema).parse(data)
}

/** Put a name on the team: on the roll already, or added to it. Returns the guest's id. */
export async function addGuestToTeam(departmentId: string, name: string, type: 'core' | 'guest'): Promise<string> {
  const { data, error } = await supabase.rpc('add_guest_to_team', { p_department: departmentId, p_name: name.trim(), p_type: type })
  if (error) throw error
  return z.string().parse(data)
}

export async function setDepartmentGuestType(id: string, type: 'core' | 'guest'): Promise<void> {
  const { error } = await supabase.from('department_guests').update({ member_type: type }).eq('id', id)
  if (error) throw error
}

export async function removeDepartmentGuest(id: string): Promise<void> {
  const { error } = await supabase.from('department_guests').delete().eq('id', id)
  if (error) throw error
}

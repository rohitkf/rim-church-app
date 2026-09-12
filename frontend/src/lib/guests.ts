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

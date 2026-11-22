import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { usePermissions } from './usePermissions'

/*
 * Who is under 18 (0321).
 *
 * The Owner asked for a label beside the name of anybody under 18, on a
 * team's page and on Volunteers. Dates of birth are closed (0257: the
 * whole date is `people.ages`'), so a page does not work it out: it asks
 * the database who is under 18 and is handed ids, with no date and no age.
 *
 * Who is handed them is its own right, `people.minors` — Admins, Heads
 * and Assisting Heads out of the box. Not everybody: anybody can sign up,
 * and which accounts are children is not for whoever signed up today.
 * Without the right the list is empty and nothing is asked.
 */

const rowsSchema = z.array(z.object({ id: z.string() }))

/** The ids of everybody under 18, for a reader the database lets see it; nobody otherwise. */
export async function fetchMinors(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('people_under_18')
  if (error) throw error
  return new Set(rowsSchema.parse(data ?? []).map((r) => r.id))
}

/** Under the people's own key, so a date of birth changing reads it again (lib/liveTables). */
export const MINORS_KEY = ['minors'] as const

const NOBODY: ReadonlySet<string> = new Set()

/** Who is under 18, as a set to ask `has(id)` of. Empty for a reader without `people.minors`. */
export function useMinors(): ReadonlySet<string> {
  const { can } = usePermissions()
  const sees = can('people.minors')
  const query = useQuery({ queryKey: MINORS_KEY, queryFn: fetchMinors, enabled: sees, staleTime: 5 * 60_000 })
  return sees ? (query.data ?? NOBODY) : NOBODY
}

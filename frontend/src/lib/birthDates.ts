import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * Dates of birth, as the database will hand them out (0256, 0257).
 *
 * Somebody's age is the Owner's and the Admins' to know, and their own.
 * `profiles.dob` is closed to everybody else, so it is read through
 * birth_dates(): the whole date where you may have it, and only the day
 * and month — enough to mark a birthday — where you may not.
 */

const rowSchema = z.object({
  id: z.string(),
  /** The whole date, or null when it is not yours to see. */
  dob: z.string().nullable(),
  /** 'MM-DD', for everybody. */
  birthday: z.string(),
})
export type BirthDate = z.infer<typeof rowSchema>

/** Everybody's (or these people's) dates, keyed by person. */
export async function fetchBirthDates(ids?: string[]): Promise<Map<string, BirthDate>> {
  if (ids && ids.length === 0) return new Map()
  const { data, error } = await supabase.rpc('birth_dates', { p_ids: ids ?? null })
  if (error) throw error
  return new Map(z.array(rowSchema).parse(data ?? []).map((r) => [r.id, r]))
}

/**
 * A date the Celebrations card and the diary can mark.
 *
 * Without the year they still know the day; 1900 is the year they already
 * read as "not known" (celebrations.ts), so no age is worked out from it.
 */
export function celebrationDate(row: BirthDate | undefined): string | null {
  if (!row) return null
  return row.dob ?? `1900-${row.birthday}`
}

/** The whole date, only where it is yours to see. */
export function fullDate(row: BirthDate | undefined): string | null {
  return row?.dob ?? null
}

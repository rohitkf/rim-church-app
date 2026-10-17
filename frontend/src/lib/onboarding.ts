import { z } from 'zod'
import { supabase } from './supabaseClient'

/*
 * What the database remembers about the tour (0153): which chapters each
 * person has seen, and when the tour was last sent to them. Writes go
 * through its two functions; this file only reads what comes back and
 * calls them.
 */

export const ONBOARDING_KEY = ['onboarding'] as const

export const onboardingRowSchema = z.object({
  user_id: z.string(),
  seen: z.record(z.string(), z.string()),
  pushed_at: z.string().nullable(),
  pushed_by: z.string().nullable().optional(),
  /** Release keys announced to this person, each with when (0156). */
  releases_seen: z.record(z.string(), z.string()).optional().default({}),
})
export type OnboardingRow = z.infer<typeof onboardingRowSchema>

const COLUMNS = 'user_id, seen, pushed_at, pushed_by, releases_seen'

/** My own row, or null before the tour has ever touched me. */
export async function fetchMyOnboarding(myId: string): Promise<OnboardingRow | null> {
  const { data, error } = await supabase.from('onboarding').select(COLUMNS).eq('user_id', myId).maybeSingle()
  if (error) throw error
  return data ? onboardingRowSchema.parse(data) : null
}

/** Everybody's rows the reader may see: their own, and whoever they may send the tour to. */
export async function fetchEveryonesOnboarding(): Promise<OnboardingRow[]> {
  const { data, error } = await supabase.from('onboarding').select(COLUMNS)
  if (error) throw error
  return z.array(onboardingRowSchema).parse(data ?? [])
}

export async function markChaptersSeen(chapters: string[]): Promise<void> {
  if (chapters.length === 0) return
  const { error } = await supabase.rpc('onboarding_mark_seen', { p_chapters: chapters })
  if (error) throw error
}

export async function markReleaseSeen(key: string): Promise<void> {
  const { error } = await supabase.rpc('release_mark_seen', { p_key: key })
  if (error) throw error
}

/** Send the tour: to these people, or to everybody when `userIds` is null. Returns how many. */
export async function pushTour(userIds: string[] | null): Promise<number> {
  const { data, error } = await supabase.rpc('push_onboarding', { p_users: userIds })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** Where somebody is with the tour, for the Onboarding room's list. */
export type TourStatus =
  | { kind: 'never' }
  | { kind: 'taken'; at: string }
  | { kind: 'sent'; at: string }

export function tourStatusOf(
  row: (Pick<OnboardingRow, 'seen' | 'pushed_at'> & Partial<Omit<OnboardingRow, 'seen' | 'pushed_at'>>) | undefined,
): TourStatus {
  if (!row) return { kind: 'never' }
  const seenAt = Object.values(row.seen).sort().pop() ?? null
  if (row.pushed_at && (!seenAt || Date.parse(seenAt) < Date.parse(row.pushed_at))) {
    return { kind: 'sent', at: row.pushed_at }
  }
  return seenAt ? { kind: 'taken', at: seenAt } : { kind: 'never' }
}

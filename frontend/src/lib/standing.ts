import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * Where somebody stands with the app: whether they may use it right now.
 *
 * The app can be closed for maintenance (0278): between two times the
 * database turns away every request from everybody who may not keep
 * working, with a reason of its own. A page of refused requests explains
 * nothing, so the app asks `my_standing()` (the one function that is let
 * through while the door is shut) and shows a page that says why and when
 * it will be back.
 *
 * The refusal is the database's; nothing here decides who gets in.
 */

export const standingSchema = z.object({
  closed: z
    .object({
      title: z.string(),
      body: z.string(),
      from: z.string(),
      until: z.string(),
    })
    .nullable(),
  /** Closed, but this person may keep working (the Owner, and whoever the grid lets). */
  may_enter: z.boolean(),
})
export type Standing = z.infer<typeof standingSchema>

/** Nothing in the way: what the app assumes until it is told otherwise. */
export const OPEN: Standing = { closed: null, may_enter: true }

export const STANDING_KEY = ['my-standing']

export async function fetchStanding(): Promise<Standing> {
  const { data, error } = await supabase.rpc('my_standing')
  if (error) throw error
  return standingSchema.parse(data)
}

/** The app is closed and this person is on the outside of it. */
export function isShutOut(standing: Standing | null | undefined): boolean {
  return !!standing?.closed && !standing.may_enter
}

/**
 * A request refused because the app is closed.
 *
 * Postgres raises `insufficient_privilege` (42501), which is also what an
 * ordinary "you may not write to that" looks like, so the reason is read
 * from the detail the hook gives, with the message as a second witness.
 */
export function isAppClosed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message, details } = error as { code?: string; message?: string; details?: string }
  if (code !== '42501' && code !== 'PGRST301') return false
  return details === 'app_closed' || /closed for maintenance/i.test(message ?? '')
}

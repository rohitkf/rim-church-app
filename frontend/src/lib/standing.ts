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
 * An account can also be blocked by name (0279): the same refusal, for one
 * person, until somebody who may block takes it back. `my_standing()`
 * says that too, and the app shows the page for it.
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
  /**
   * Blocked by an administrator, and when. Not who or why: the page says
   * who to speak to. A database that has not heard of blocking leaves the
   * key out, which is the same as not blocked.
   */
  blocked: z.object({ at: z.string() }).nullable().default(null),
})
export type Standing = z.infer<typeof standingSchema>

/** Nothing in the way: what the app assumes until it is told otherwise. */
export const OPEN: Standing = { closed: null, may_enter: true, blocked: null }

export const STANDING_KEY = ['my-standing']

export async function fetchStanding(): Promise<Standing> {
  const { data, error } = await supabase.rpc('my_standing')
  if (error) throw error
  return standingSchema.parse(data)
}

/** This person's account is blocked. */
export function isBlocked(standing: Standing | null | undefined): boolean {
  return !!standing?.blocked
}

/**
 * This person is on the outside of the app: their account is blocked, or
 * the app is closed and they are not one of those who may keep working.
 */
export function isShutOut(standing: Standing | null | undefined): boolean {
  return isBlocked(standing) || (!!standing?.closed && !standing.may_enter)
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

/** A request refused because this person's account is blocked (0279). */
export function isAccountBlocked(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message, details } = error as { code?: string; message?: string; details?: string }
  if (code !== '42501' && code !== 'PGRST301') return false
  return details === 'account_blocked' || /blocked by an administrator/i.test(message ?? '')
}

/** Refused for a reason `my_standing()` can explain: ask it, and the page that says why takes over. */
export function isTurnedAway(error: unknown): boolean {
  return isAppClosed(error) || isAccountBlocked(error)
}

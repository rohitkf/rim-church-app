import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * Blocking an account without removing it (0279).
 *
 * A blocked person can still sign in and can do nothing else: the
 * database turns away every request they make, and the app shows them
 * pages/BlockedPage. Nothing of theirs is touched, so taking the block
 * back puts them exactly where they were.
 *
 * Who is blocked is read from `account_blocks`, which only answers for
 * somebody who may block (`people.block`); for everybody else the list is
 * empty and the People page looks as it always did. The table cannot be
 * written to: `block_account` and `unblock_account` are the only way in,
 * because who may block whom is their rule, not the page's.
 */

export const accountBlockSchema = z.object({
  user_id: z.string(),
  /** Why, for the people who may block. The person blocked is never shown it. */
  reason: z.string().nullable(),
  blocked_by: z.string().nullable(),
  blocked_at: z.string(),
})
export type AccountBlock = z.infer<typeof accountBlockSchema>

export const ACCOUNT_BLOCKS_KEY = ['account-blocks']

/** The longest note the database keeps. */
export const BLOCK_REASON_MAX = 300

export async function fetchAccountBlocks(): Promise<AccountBlock[]> {
  const { data, error } = await supabase.from('account_blocks').select('user_id, reason, blocked_by, blocked_at')
  if (error) throw error
  return z.array(accountBlockSchema).parse(data ?? [])
}

export async function blockAccount(userId: string, why: string): Promise<void> {
  const note = why.trim().slice(0, BLOCK_REASON_MAX)
  const { error } = await supabase.rpc('block_account', { target_user_id: userId, why: note === '' ? null : note })
  if (error) throw error
}

export async function unblockAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_account', { target_user_id: userId })
  if (error) throw error
}

/**
 * Whether the Block and Unblock buttons belong on somebody's card.
 *
 * The database's rule, said once more so a button that would be refused
 * is not offered: never yourself, never the Owner, and an Admin only by
 * the Owner. It decides what is shown; block_account decides what happens.
 */
export function mayBlock(who: {
  /** The grid gives the viewer `people.block`. */
  hasRight: boolean
  viewerId: string | null | undefined
  viewerIsOwner: boolean
  targetId: string
  targetIsOwner: boolean
  targetIsAdmin: boolean
}): boolean {
  if (!who.hasRight) return false
  if (who.targetId === who.viewerId) return false
  if (who.targetIsOwner) return false
  return !who.targetIsAdmin || who.viewerIsOwner
}

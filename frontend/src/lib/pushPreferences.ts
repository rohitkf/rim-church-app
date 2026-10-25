import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * What a person has asked not to be buzzed for (0185). Message board posts
 * and team chat push to the phone unless turned off here; the bell keeps
 * them either way. One row per account, only once they have chosen.
 */
export interface PushPreferences {
  board: boolean
  team_chat: boolean
}

export const PUSH_DEFAULTS: PushPreferences = { board: true, team_chat: true }

export const pushPreferencesKey = (userId: string | undefined) => ['push-preferences', userId] as const

const rowSchema = z.object({ board: z.boolean(), team_chat: z.boolean() })

export async function fetchPushPreferences(userId: string): Promise<PushPreferences> {
  const { data, error } = await supabase
    .from('push_preferences')
    .select('board, team_chat')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? rowSchema.parse(data) : PUSH_DEFAULTS
}

export async function savePushPreferences(userId: string, next: PushPreferences): Promise<void> {
  const { error } = await supabase
    .from('push_preferences')
    .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

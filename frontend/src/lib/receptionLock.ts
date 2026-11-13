import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { useAuth } from '../auth/AuthContext'

/**
 * Whether Reception is locked (0288).
 *
 * A door right is given once and then holds every day, though it is
 * wanted for the morning of an event. While Reception is locked the four
 * door rights give nothing — not the page, not a check-in, a payment or a
 * walk-in — and they come back untouched when it is unlocked. Whoever
 * runs registrations ("Run registrations"; the Owner always) is not held
 * by it, and is who turns the key.
 *
 * The database decides (`registration_can`); this is the same answer, so
 * that somebody turned away is told why and not shown an empty page.
 */

export const RECEPTION_LOCK_KEY = ['reception-lock'] as const

/** The longest line a locked door can say. The database holds it to the same. */
export const LOCK_NOTE_MAX = 200

const stateSchema = z.object({
  locked: z.boolean(),
  note: z.string().nullable().catch(null),
  changed_at: z.string().nullable().catch(null),
  changed_by: z.string().nullable().catch(null),
})
export type ReceptionLock = z.infer<typeof stateSchema>

export const UNLOCKED: ReceptionLock = { locked: false, note: null, changed_at: null, changed_by: null }

export async function fetchReceptionLock(): Promise<ReceptionLock> {
  const { data, error } = await supabase.rpc('reception_lock_state')
  if (error) throw error
  return data ? stateSchema.parse(data) : UNLOCKED
}

export async function setReceptionLock(locked: boolean, note: string | null = null): Promise<ReceptionLock> {
  const { data, error } = await supabase.rpc('set_reception_lock', { p_locked: locked, p_note: note })
  if (error) throw error
  return data ? stateSchema.parse(data) : { ...UNLOCKED, locked }
}

/**
 * The lock, asked again every so often: a page open at the door has to
 * notice the key being turned without being reloaded. Until the first
 * answer — and if the question cannot be asked — it reads as unlocked:
 * the database refuses whatever a locked door would, so nothing is let
 * through by it, and nobody is shut out on a guess.
 */
export function useReceptionLock({ watch = false }: { watch?: boolean } = {}) {
  const { session } = useAuth()
  const query = useQuery({
    queryKey: RECEPTION_LOCK_KEY,
    queryFn: fetchReceptionLock,
    enabled: !!session?.user.id,
    staleTime: 15_000,
    refetchInterval: watch ? 20_000 : false,
  })
  return { ...(query.data ?? UNLOCKED), settled: query.isSuccess || query.isError, query }
}

/** "Locked by Grace Mensah, 3 minutes ago" — the parts that are known. */
export function lockedByWords(lock: ReceptionLock, ago: (iso: string) => string): string {
  const who = lock.changed_by ? ` by ${lock.changed_by}` : ''
  const when = lock.changed_at ? `, ${ago(lock.changed_at)}` : ''
  return `${lock.locked ? 'Locked' : 'Unlocked'}${who}${when}`
}

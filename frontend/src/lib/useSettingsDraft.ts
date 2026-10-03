import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { useErrorText } from './useErrorText'
import { DEFAULT_SETTINGS, SETTINGS_KEY, fetchAppSettings, type AppSettings } from './appSettings'

/**
 * A draft of some of the church's settings, and a Save that writes only
 * those.
 *
 * Every Settings room used to edit a copy of the whole row and save the
 * whole row, so a room had to remember which columns other rooms owned and
 * leave them out — or quietly undo a colour chosen in another tab since
 * this one loaded. Now a room names its keys, and those are all it can
 * send. Two Admins in two rooms cannot undo each other.
 */
export function useSettingsDraft<K extends keyof AppSettings>(keys: readonly K[]) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchAppSettings })
  const [draft, setDraft] = useState<Pick<AppSettings, K> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // A stable identity for the list, whatever array the caller wrote inline.
  const keyId = keys.join('|')
  const pick = useCallback(
    (from: AppSettings) =>
      Object.fromEntries(keyId.split('|').map((k) => [k, from[k as K]])) as Pick<AppSettings, K>,
    [keyId],
  )

  useEffect(() => {
    if (query.data) setDraft(pick(query.data))
  }, [query.data, pick])

  const current = query.data ? pick(query.data) : null

  const mutation = useMutation({
    mutationFn: async (next: Pick<AppSettings, K>) => {
      const { error } = await supabase
        .from('app_settings')
        .update(next as Record<string, unknown>)
        .eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      setSaved(true)
      // Every page reads these, and most of them are already on screen
      // behind this one, so the whole cache is the honest thing to drop.
      queryClient.invalidateQueries()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the settings.')),
  })

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

  return {
    query,
    draft,
    error,
    saved,
    saving: mutation.isPending,
    /** Something in the draft differs from what is stored. */
    changed: !!draft && !!current && !same(draft, current),
    /** This one key differs from what is stored. */
    differs: (key: K) => !!draft && !!current && !same(draft[key], current[key]),
    set: <T extends K>(key: T, value: AppSettings[T]) => {
      setSaved(false)
      setDraft((d) => (d ? { ...d, [key]: value } : d))
    },
    /** Back to what the app ships with — in the draft, until Save. */
    restoreDefaults: () => {
      setSaved(false)
      setDraft(pick(DEFAULT_SETTINGS))
    },
    save: () => draft && mutation.mutate(draft),
  }
}

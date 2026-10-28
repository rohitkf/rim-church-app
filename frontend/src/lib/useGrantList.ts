import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { useErrorText } from './useErrorText'
import { PERMISSIONS_KEY, usePermissions } from './usePermissions'
import type { CapabilityKey, GrantReach } from './permissions'

/** Teams and people, by id — the shape the rooms' editors draw. */
export interface GrantList {
  teams: string[]
  people: string[]
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * One capability's grants (0208) as the list a room used to keep: the
 * teams and the people it is given to, at one reach. A draft until saved,
 * like the rest of the room, then the one call that writes it —
 * set_permission_grants(), adding what was added and taking back what
 * was taken off.
 */
export function useGrantList(capability: CapabilityKey, reach: GrantReach = 'all') {
  const { grants = [] } = usePermissions()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const stored: GrantList = useMemo(() => {
    const mine = grants.filter((g) => g.capability === capability)
    return {
      teams: mine.flatMap((g) => (g.departmentId ? [g.departmentId] : [])),
      people: mine.flatMap((g) => (g.userId ? [g.userId] : [])),
    }
  }, [grants, capability])
  const [draft, setDraft] = useState<GrantList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const working = draft ?? stored
  const changed = !!draft && (!same(draft.teams, stored.teams) || !same(draft.people, stored.people))

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return
      const changes = [
        ...draft.teams.filter((id) => !stored.teams.includes(id)).map((team) => ({ capability, team, reach })),
        ...stored.teams.filter((id) => !draft.teams.includes(id)).map((team) => ({ capability, team, reach: null })),
        ...draft.people.filter((id) => !stored.people.includes(id)).map((person) => ({ capability, person, reach })),
        ...stored.people.filter((id) => !draft.people.includes(id)).map((person) => ({ capability, person, reach: null })),
      ]
      if (changes.length === 0) return
      const { error } = await supabase.rpc('set_permission_grants', { p_changes: changes })
      if (error) throw error
    },
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
      setDraft(null)
      setSaved(true)
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save who may.')),
  })

  return {
    working,
    changed,
    set: (next: GrantList) => {
      setSaved(false)
      setDraft(next)
    },
    save: () => save.mutateAsync(),
    saving: save.isPending,
    saved,
    error,
  }
}

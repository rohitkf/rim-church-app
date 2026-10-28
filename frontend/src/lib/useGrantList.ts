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
 *
 * A list whose teams can be "its Heads alone" (0213) says so per list,
 * as the rooms always did — `withLeads` — and then every team it gives
 * carries the choice: `leadsOnly`, as stored, and `setLeadsOnly`. Any
 * other list's teams carry their whole roster.
 */
export function useGrantList(
  capability: CapabilityKey,
  { reach = 'all', withLeads = false }: { reach?: GrantReach; withLeads?: boolean } = {},
) {
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
  // Heads alone when every team's grant says so; with none, as the rooms began: Heads.
  const storedLeadsOnly = useMemo(() => {
    const teams = grants.filter((g) => g.capability === capability && g.departmentId)
    return teams.length === 0 ? true : teams.every((g) => !!g.leadsOnly)
  }, [grants, capability])
  const [leadsDraft, setLeadsDraft] = useState<boolean | null>(null)
  const leadsOnly = leadsDraft ?? storedLeadsOnly
  const [draft, setDraft] = useState<GrantList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const working = draft ?? stored
  const leadsChanged = withLeads && leadsDraft !== null && leadsDraft !== storedLeadsOnly && working.teams.length > 0
  const changed = (!!draft && (!same(draft.teams, stored.teams) || !same(draft.people, stored.people))) || leadsChanged

  const save = useMutation({
    mutationFn: async () => {
      const next = draft ?? stored
      // A change of Heads-or-everybody is said again for every team kept.
      const teamAdds = leadsChanged ? next.teams : next.teams.filter((id) => !stored.teams.includes(id))
      const leads = withLeads ? { leads_only: leadsOnly } : {}
      const changes = [
        ...teamAdds.map((team) => ({ capability, team, reach, ...leads })),
        ...stored.teams.filter((id) => !next.teams.includes(id)).map((team) => ({ capability, team, reach: null })),
        ...next.people.filter((id) => !stored.people.includes(id)).map((person) => ({ capability, person, reach })),
        ...stored.people.filter((id) => !next.people.includes(id)).map((person) => ({ capability, person, reach: null })),
      ]
      if (changes.length === 0) return
      const { error } = await supabase.rpc('set_permission_grants', { p_changes: changes })
      if (error) throw error
    },
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
      setDraft(null)
      setLeadsDraft(null)
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
    leadsOnly,
    setLeadsOnly: (next: boolean) => {
      setSaved(false)
      setLeadsDraft(next)
    },
    save: () => save.mutateAsync(),
    saving: save.isPending,
    saved,
    error,
  }
}

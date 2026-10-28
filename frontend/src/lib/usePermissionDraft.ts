import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { useErrorText } from './useErrorText'
import { usePermissions } from './usePermissions'
import {
  changesBetween,
  defaultsOver,
  teamChangesBetween,
  type CapabilityKey,
  type GrantRole,
  type GridRole,
  type Overrides,
  type PermissionChange,
  type Reach,
  type TeamOverrides,
} from './permissions'

/**
 * A draft of the church's permission grid — the church's cells and the
 * teams' own (0162) — and the one call that saves it.
 *
 * Every room that edits the grid holds the same two drafts and sends the
 * same `set_permissions()` call, so this is that, once. Each draft is
 * null until touched: a save from another Admin then redraws the page
 * rather than hiding under a stale copy.
 */
export function usePermissionDraft() {
  // A caller without the teams' rules (a test double, an older reader) reads as no team having any.
  const { can, overrides: stored, teams: storedTeams = {}, grants = [] } = usePermissions()
  const editable = can('app.permissions')
  const queryClient = useQueryClient()
  const errorText = useErrorText()

  const [draft, setDraft] = useState<Overrides | null>(null)
  const [teamDraft, setTeamDraft] = useState<TeamOverrides | null>(null)
  const [error, setError] = useState<string | null>(null)
  const working = draft ?? stored
  const workingTeams = teamDraft ?? storedTeams
  const pending = useMemo(
    () => [...changesBetween(stored, working), ...teamChangesBetween(storedTeams, workingTeams)],
    [stored, working, storedTeams, workingTeams],
  )

  const save = useMutation({
    mutationFn: async (changes: PermissionChange[]) => {
      if (changes.length === 0) return
      const { error } = await supabase.rpc('set_permissions', { p_changes: changes })
      if (error) throw error
    },
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries()
      setDraft(null)
      setTeamDraft(null)
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the permissions.')),
  })

  const chooseChurch = (capability: CapabilityKey, who: GridRole, reach: Reach) =>
    setDraft((d) => {
      const base = d ?? stored
      return { ...base, [capability]: { ...base[capability], [who]: reach } }
    })

  /** One team's cell: a reach of its own, or null to follow the church again. */
  const chooseTeam = (dept: string, capability: CapabilityKey, who: GrantRole, reach: Reach | null) =>
    setTeamDraft((d) => {
      const base = d ?? storedTeams
      const mine = { ...(base[dept] ?? {}) }
      const cell = { ...(mine[capability] ?? {}) }
      if (reach) cell[who] = reach
      else delete cell[who]
      mine[capability] = cell
      return { ...base, [dept]: mine }
    })

  /** One team's own rules made another's, all of them, in the draft until saved. */
  const copyTeam = (from: string, to: string) =>
    setTeamDraft((d) => {
      const base = d ?? storedTeams
      return { ...base, [to]: { ...(base[from] ?? {}) } }
    })

  /** The church's cells as a whole, in the draft: a preset (lib/presets), until saved. */
  const draftChurch = (next: Overrides) => setDraft(next)

  /** Every cell back to the app's default, every team back to the church's — in the draft, until saved. */
  const restoreDefaults = () => {
    setDraft(defaultsOver(stored))
    setTeamDraft(Object.fromEntries(Object.keys(storedTeams).map((id) => [id, {}])))
  }

  return {
    editable,
    stored,
    storedTeams,
    /** The church's grants (0208), as stored; a room edits its own through set_permission_grants(). */
    grants,
    working,
    workingTeams,
    pending,
    chooseChurch,
    chooseTeam,
    restoreDefaults,
    draftChurch,
    copyTeam,
    /** Sends what is pending. Resolves once the grid has been re-read. */
    commit: () => save.mutateAsync(pending),
    saving: save.isPending,
    error,
  }
}

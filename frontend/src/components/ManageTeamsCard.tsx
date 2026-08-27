import { type FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import type { Department } from '../lib/types'

interface ManageTeamsCardProps {
  departments: Department[]
}

/**
 * The two Admin decisions that are about the set of teams rather than any
 * one team: adding a team, and which team gives the final checklist
 * sign-off. Everything that belongs to a single team — its colour, name and
 * removal — lives on that team's own card.
 */
export function ManageTeamsCard({ departments }: ManageTeamsCardProps) {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    setError(null)
    queryClient.invalidateQueries({ queryKey: ['departments'] })
  }

  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('departments').insert({ name })
      if (error) throw error
    },
    onSuccess: () => {
      setNewName('')
      refresh()
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not create that team.')),
  })

  // Exactly one team holds the sign-off, so setting it clears the previous
  // holder first (a partial unique index enforces the same rule in the DB).
  const setSignOffTeam = useMutation({
    mutationFn: async (id: string) => {
      const { error: clearError } = await supabase
        .from('departments')
        .update({ is_service_flow: false })
        .eq('is_service_flow', true)
      if (clearError) throw clearError
      if (!id) return
      const { error } = await supabase.from('departments').update({ is_service_flow: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorMessage(err, 'Could not set the sign-off team.')),
  })

  const signOffTeam = departments.find((d) => d.is_service_flow)

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    createTeam.mutate(newName.trim())
  }

  return (
    <section className="mt-6 rounded-lg border border-border-subtle bg-surface-lowest p-5">
      <h2 className="text-headline-md">Team setup</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Admins only. Each team's colour, name and removal are on its own card below.
      </p>

      {error && (
        <p className="mt-4 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
            New team
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Service Flow Coordinator"
              className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={createTeam.isPending}
            className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {createTeam.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>

        <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
          Team that signs checklists off
          <select
            value={signOffTeam?.id ?? ''}
            onChange={(e) => setSignOffTeam.mutate(e.target.value)}
            disabled={setSignOffTeam.isPending}
            className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
          >
            <option value="">No team chosen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="text-label-sm">
            The Service Flow Coordinator team: after a member ticks an item and their head verifies
            it, this team gives the last signature. Nothing can be signed off until one is chosen.
          </span>
        </label>
      </div>
    </section>
  )
}

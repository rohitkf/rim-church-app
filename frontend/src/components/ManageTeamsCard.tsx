import { type FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import type { Department } from '../lib/types'
import { ActionButton, Field, Panel, inputClasses } from './Surface'
import { UsersIcon } from './icons'

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
    <Panel
      title="Team setup"
      icon={UsersIcon}
      className="mt-2"
      aside={
        <span className="text-label-sm text-on-surface-variant">
          Admins only · each team's colour, name and removal live on its card
        </span>
      }
      bodyClassName="p-5"
    >
      {error && (
        <p className="mb-4 rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <Field label="New team" className="flex-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Service Flow Coordinator"
              className={inputClasses}
            />
          </Field>
          <ActionButton type="submit" disabled={createTeam.isPending} glyph="+">
            {createTeam.isPending ? 'Creating' : 'Create'}
          </ActionButton>
        </form>

        <Field
          label="Team that signs checklists off"
          hint="The Service Flow Coordinator team: after a member ticks an item and their head verifies it, this team gives the last signature. Nothing can be signed off until one is chosen."
        >
          <select
            value={signOffTeam?.id ?? ''}
            onChange={(e) => setSignOffTeam.mutate(e.target.value)}
            disabled={setSignOffTeam.isPending}
            className={inputClasses}
          >
            <option value="">No team chosen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Panel>
  )
}

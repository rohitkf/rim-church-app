import { type FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import type { Department } from '../lib/types'

interface ManageTeamsCardProps {
  departments: Department[]
}

/**
 * Admin-only home for the things that create and shape a team: adding one,
 * renaming it, its badge colour, removing it, and which team signs a
 * checklist off last.
 *
 * The sign-off team is one choice across the whole church — the Service
 * Flow Coordinator team — so it is a single picker here rather than a
 * checkbox repeated on every team, which read as though "service flow" were
 * a property each team could have.
 */
export function ManageTeamsCard({ departments }: ManageTeamsCardProps) {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null)

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

  const renameTeam = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('departments').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setRenaming(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not rename that team.')),
  })

  const setColor = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) => {
      const { error } = await supabase.from('departments').update({ color }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorMessage(err, 'Could not save that colour.')),
  })

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setPendingDelete(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not delete that team.')),
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
      <h2 className="text-headline-md">Manage teams</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Admins only. Adding, renaming and removing teams, and choosing who signs checklists off.
      </p>

      {error && (
        <p className="mt-4 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <form onSubmit={handleCreate} className="mt-4 flex max-w-md items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
          New team name
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

      <label className="mt-6 flex max-w-md flex-col gap-1 text-body-sm text-on-surface-variant">
        Final checklist sign-off team
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
          This is the Service Flow Coordinator team: after a member ticks an item and their
          department head verifies it, whoever this team's rota puts on the service gives the final
          sign-off. Until a team is chosen, nothing can be signed off.
        </span>
      </label>

      <ul className="mt-6 flex flex-col divide-y divide-border-subtle">
        {departments.map((dept) => (
          <li key={dept.id} className="flex flex-wrap items-center gap-3 py-3">
            <input
              type="color"
              defaultValue={dept.color ?? DEFAULT_DEPT_COLOR}
              onBlur={(e) => {
                if (e.target.value !== (dept.color ?? DEFAULT_DEPT_COLOR)) {
                  setColor.mutate({ id: dept.id, color: e.target.value })
                }
              }}
              aria-label={`Badge colour for ${dept.name}`}
              className="h-6 w-9 shrink-0 cursor-pointer rounded-sm border border-border-subtle bg-transparent p-0"
            />

            {renaming?.id === dept.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (renaming.name.trim()) renameTeam.mutate({ id: dept.id, name: renaming.name.trim() })
                }}
                className="flex flex-1 flex-wrap items-center gap-2"
              >
                <input
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: dept.id, name: e.target.value })}
                  autoFocus
                  className="min-w-40 flex-1 rounded-sm border border-border-subtle px-2 py-1.5 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={renameTeam.isPending}
                  className="rounded-sm bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {renameTeam.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(null)
                    setError(null)
                  }}
                  className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm text-on-surface hover:border-secondary"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-body-md text-on-surface">
                  {dept.name}
                  {dept.is_service_flow && (
                    <span className="ml-2 rounded-full bg-secondary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide text-secondary">
                      signs off
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setRenaming({ id: dept.id, name: dept.name })
                  }}
                  className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm text-on-surface hover:border-secondary"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setPendingDelete(dept)
                  }}
                  className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm text-error hover:border-error"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-team-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
            <h3 id="delete-team-title" className="text-headline-md">
              Delete {pendingDelete.name}?
            </h3>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              Its membership, roles, role checklists, rota assignments and availability go with it.
              Nobody loses their account. There's no undo.
            </p>
            {error && (
              <p className="mt-3 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null)
                  setError(null)
                }}
                className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteTeam.mutate(pendingDelete.id)}
                disabled={deleteTeam.isPending}
                className="rounded-sm bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {deleteTeam.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

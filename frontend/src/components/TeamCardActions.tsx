import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import type { Department } from '../lib/types'

/**
 * The Admin controls that belong to one team — its badge colour, its name,
 * and removing it. They live on the team's own card rather than in a second
 * list of every team, which is what made this page say everything twice.
 */
export function TeamCardActions({ dept }: { dept: Department }) {
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = () => {
    setError(null)
    setRenaming(null)
    setConfirmDelete(false)
    queryClient.invalidateQueries({ queryKey: ['departments'] })
  }

  const rename = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('departments').update({ name }).eq('id', dept.id)
      if (error) throw error
    },
    onSuccess: done,
    onError: (err: unknown) => setError(errorMessage(err, 'Could not rename that team.')),
  })

  const recolour = useMutation({
    mutationFn: async (color: string) => {
      const { error } = await supabase.from('departments').update({ color }).eq('id', dept.id)
      if (error) throw error
    },
    onSuccess: done,
    onError: (err: unknown) => setError(errorMessage(err, 'Could not save that colour.')),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('departments').delete().eq('id', dept.id)
      if (error) throw error
    },
    onSuccess: done,
    onError: (err: unknown) => setError(errorMessage(err, 'Could not delete that team.')),
  })

  return (
    <div className="mt-auto border-t border-border-subtle pt-3">
      {error && <p className="mb-2 text-label-sm text-error">{error}</p>}

      {renaming === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            defaultValue={dept.color ?? DEFAULT_DEPT_COLOR}
            onBlur={(e) => {
              if (e.target.value !== (dept.color ?? DEFAULT_DEPT_COLOR)) recolour.mutate(e.target.value)
            }}
            aria-label={`Badge colour for ${dept.name}`}
            className="h-7 w-9 shrink-0 cursor-pointer rounded-sm border border-border-subtle bg-transparent p-0"
          />
          <button
            type="button"
            onClick={() => setRenaming(dept.name)}
            className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm text-on-surface hover:border-secondary"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded-sm px-2 py-1.5 text-body-sm text-on-surface-variant hover:text-error"
          >
            Delete
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (renaming.trim()) rename.mutate(renaming.trim())
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            autoFocus
            aria-label="Team name"
            className="min-w-32 flex-1 rounded-sm border border-border-subtle px-2 py-1.5 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
          />
          <button
            type="submit"
            disabled={rename.isPending}
            className="rounded-sm bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            Save
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
      )}

      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-team-${dept.id}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
            <h3 id={`delete-team-${dept.id}`} className="text-headline-md">
              Delete {dept.name}?
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
                  setConfirmDelete(false)
                  setError(null)
                }}
                className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="rounded-sm bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {remove.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

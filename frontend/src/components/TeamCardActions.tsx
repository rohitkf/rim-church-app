import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { Overlay } from './Surface'
import { TeamColorSheet } from './TeamColorSheet'
import type { Department } from '../lib/types'

/**
 * The Admin controls that belong to one team — its badge colour, its name,
 * and removing it. They live on the team's own card rather than in a second
 * list of every team, which is what made this page say everything twice.
 */
export function TeamCardActions({ dept }: { dept: Department }) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const done = () => {
    setError(null)
    setRenaming(null)
    setConfirmDelete(false)
    setPicking(false)
    // Mark the list stale so it is re-read the next time it mounts, but
    // don't refetch right now: the cache has just been given the row the
    // database itself returned, and an immediate refetch can only either
    // agree with it or — if it is served before the write is visible —
    // overwrite the correct value with the old one, which is exactly the
    // "I have to refresh to see it" bug.
    queryClient.invalidateQueries({ queryKey: ['departments'], refetchType: 'none' })
    // Everything else does need re-reading: a rota row, a join request and
    // the team detail page each embed their own copy of the team, and a
    // renamed or recoloured team has to reach those too. Listing them by
    // key would rot the first time one is added, and this only runs when an
    // Admin edits a team.
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'departments' })
  }

  /**
   * Put the row the database just handed back into the cache.
   *
   * Invalidating alone means the new colour only appears when a refetch
   * lands, which is a round trip the user is watching and, if it is served
   * before the write is visible, one they have to refresh past. The updated
   * row comes back with the write itself, so use it: the card repaints
   * immediately and correctly, and the refetch becomes reconciliation
   * rather than the thing the UI depends on.
   */
  const applyToCache = (updated: Partial<Department>) => {
    queryClient.setQueriesData<Department[]>({ queryKey: ['departments'] }, (old) =>
      old?.map((d) => (d.id === dept.id ? { ...d, ...updated } : d)),
    )
  }

  /**
   * A write that changed nothing is not a success.
   *
   * `update` without `select` reports no error when RLS quietly filters the
   * row out, so the app would say "saved" and show the old value — exactly
   * the shape of a bug that reads as "it didn't update". Asking for the row
   * back turns that into something we can say out loud.
   */
  const saveDepartment = async (patch: Partial<Department>) => {
    const { data, error } = await supabase
      .from('departments')
      .update(patch)
      .eq('id', dept.id)
      .select()
    if (error) throw error
    if (!data || data.length === 0) throw new Error('That change did not save — you may not have permission to edit this team.')
    return data[0] as Department
  }

  const rename = useMutation({
    mutationFn: (name: string) => saveDepartment({ name }),
    onSuccess: (updated) => {
      applyToCache(updated)
      done()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not rename that team.')),
  })

  const recolour = useMutation({
    mutationFn: (color: string) => saveDepartment({ color }),
    onSuccess: (updated) => {
      applyToCache(updated)
      done()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that colour.')),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('departments').delete().eq('id', dept.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.setQueriesData<Department[]>({ queryKey: ['departments'] }, (old) =>
        old?.filter((d) => d.id !== dept.id),
      )
      done()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that team.')),
  })

  return (
    <div className="border-t border-black/5 pt-4 dark:border-white/8">
      {error && <p className="mb-2 text-label-sm text-error">{error}</p>}

      {renaming === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`Colour for ${dept.name}`}
            title="Team colour"
            className="tap-square h-8 w-8 shrink-0 rounded-full ring-1 ring-inset ring-black/10 transition-transform duration-500 ease-[var(--ease-glide)] hover:scale-110 active:scale-95 dark:ring-white/15"
            style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
          />
          <button
            type="button"
            onClick={() => setRenaming(dept.name)}
            className="tap rounded-full px-3.5 py-1.5 text-body-sm text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 active:scale-[0.98] dark:ring-white/10 dark:hover:ring-white/25"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="tap ml-auto rounded-full px-3 py-1.5 text-body-sm text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:text-error"
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
            className="min-w-32 flex-1 rounded-xl border-0 bg-surface-low px-3 py-1.5 text-body-md text-on-surface ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-secondary dark:bg-surface-container dark:ring-white/10"
          />
          <button
            type="submit"
            disabled={rename.isPending}
            className="rounded-full bg-primary px-4 py-1.5 text-body-sm font-medium text-on-primary transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setRenaming(null)
              setError(null)
            }}
            className="tap rounded-full px-3.5 py-1.5 text-body-sm text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
          >
            Cancel
          </button>
        </form>
      )}

      {picking && (
        <TeamColorSheet
          teamName={dept.name}
          current={dept.color}
          saving={recolour.isPending}
          error={error}
          onSave={(hex) => recolour.mutate(hex)}
          onClose={() => {
            setPicking(false)
            setError(null)
          }}
        />
      )}

      {confirmDelete && (
        <Overlay
          label={`Delete ${dept.name}?`}
          onDismiss={() => {
            setConfirmDelete(false)
            setError(null)
          }}
        >
          <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
            <h3 className="text-headline-md">
              Delete {dept.name}?
            </h3>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              Its membership, roles, role checklists, rota assignments and availability go with it.
              Nobody loses their account. There's no undo.
            </p>
            {error && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
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
                className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="rounded-full bg-error px-5 py-2.5 text-body-sm font-medium text-on-error shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
              >
                {remove.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

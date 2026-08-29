import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'

type Mode = 'activity' | 'everything'

const CONFIRM_PHRASE = 'RESET'

/**
 * The owner's escape hatch for trying the app out: clear the data and start
 * again. Two levels, because "start fresh" usually means either "clear what
 * we did" or "clear everything including the setup".
 *
 * Not an Admin's. Admin is a job several people hold and is handed out
 * freely; the one irreversible button in the app belongs with ownership,
 * which is held by a single account on purpose.
 */
export function AdminResetCard() {
  const { isSuperAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: async (which: Mode) => {
      const { error } = await supabase.rpc('admin_reset_data', {
        include_setup: which === 'everything',
      })
      if (error) throw error
    },
    onSuccess: (_data, which) => {
      setMode(null)
      setTyped('')
      setError(null)
      setDone(
        which === 'everything'
          ? 'Everything cleared. You are the only account left.'
          : 'Activity cleared. Teams, roles, members, templates and inventory are untouched.',
      )
      // Nothing on screen survives this, so drop every cached query
      // rather than trying to work out which ones moved.
      queryClient.clear()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not reset the data.')),
  })

  if (!isSuperAdmin) return null

  const needsPhrase = mode === 'everything'
  const canConfirm = !needsPhrase || typed.trim().toUpperCase() === CONFIRM_PHRASE

  return (
    <section className="mt-10 max-w-xl rounded-lg border border-error/40 bg-error-container/30 p-6">
      <h2 className="text-headline-md">Reset app data</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        For trying features out on a clean slate. This deletes real records and can't be undone —
        it is the owner's alone, not every Admin's.
      </p>

      {done && (
        <p className="mt-4 rounded-full bg-secondary/10 px-3 py-2 text-body-sm text-secondary">{done}</p>
      )}
      {error && !mode && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        <div className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-4">
          <div className="font-medium text-on-surface">Clear activity</div>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Services and their running orders, rota, checklist progress, availability, attendance
            and the message board. Teams, roles, members, service templates and inventory all stay,
            so you can test again straight away.
          </p>
          <button
            onClick={() => {
              setError(null)
              setDone(null)
              setMode('activity')
            }}
            className="tap mt-3 rounded-full hairline px-4 py-2 text-body-sm font-medium text-error hover:border-error"
          >
            Clear activity
          </button>
        </div>

        <div className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-4">
          <div className="font-medium text-on-surface">Clear everything</div>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            All of the above, plus every team with its roles, role checklists and members, plus
            service templates, inventory, and every other account. Only your own account survives.
            Any team made afterwards still comes with its Coordinator role.
          </p>
          <button
            onClick={() => {
              setError(null)
              setDone(null)
              setMode('everything')
            }}
            className="tap mt-3 rounded-full hairline px-4 py-2 text-body-sm font-medium text-error hover:border-error"
          >
            Clear everything
          </button>
        </div>
      </div>

      {mode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 shadow-lg">
            <h3 id="reset-title" className="text-headline-md">
              {mode === 'everything' ? 'Clear everything?' : 'Clear activity?'}
            </h3>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              {mode === 'everything'
                ? "This deletes every service, team, role, checklist, template, inventory item and account except your own. There's no undo and no backup — anything you still need should be exported first."
                : "This deletes every service and everything recorded against it, plus the message board. Teams, roles, members, templates and inventory are left alone. There's no undo."}
            </p>

            {needsPhrase && (
              <label className="mt-4 flex flex-col gap-1 text-body-sm text-on-surface-variant">
                Type {CONFIRM_PHRASE} to confirm
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-error focus:outline-none"
                />
              </label>
            )}

            {error && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode(null)
                  setTyped('')
                  setError(null)
                }}
                className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => reset.mutate(mode)}
                disabled={reset.isPending || !canConfirm}
                className="rounded-full bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {reset.isPending
                  ? 'Resetting…'
                  : mode === 'everything'
                    ? 'Yes, clear everything'
                    : 'Yes, clear activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

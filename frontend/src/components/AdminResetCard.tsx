import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { ActionButton, Overlay, SectionTile, inputClasses } from './Surface'

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

  const close = () => {
    setMode(null)
    setTyped('')
    setError(null)
  }
  const choose = (which: Mode) => {
    setError(null)
    setDone(null)
    setMode(which)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[var(--radius-row)] bg-[color-mix(in_oklab,var(--color-accent-red)_10%,transparent)] px-4 py-3 text-body-sm text-accent-red-soft">
        For trying features out on a clean slate. These delete real records, and there is no undo.
      </p>

      {done && (
        <p role="status" className="rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-accent-green">
          {done}
        </p>
      )}
      {error && !mode && (
        <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <SectionTile
        title="Clear activity"
        hint="Services and their running orders, rota, checklist progress, availability, attendance and the message board."
      >
        <p className="text-body-sm text-on-surface-faint">
          Teams, roles, members, service templates and inventory all stay, so you can test again
          straight away.
        </p>
        <ActionButton tone="danger-quiet" size="sm" className="mt-4" onClick={() => choose('activity')}>
          Clear activity
        </ActionButton>
      </SectionTile>

      <SectionTile
        tone="danger"
        title="Clear everything"
        hint="All of the above, plus every team, role, checklist, template, inventory item and every other account."
      >
        <p className="text-body-sm text-on-surface-faint">
          Only your own account survives. Any team made afterwards still comes with its Coordinator
          role.
        </p>
        <ActionButton tone="danger-quiet" size="sm" className="mt-4" onClick={() => choose('everything')}>
          Clear everything
        </ActionButton>
      </SectionTile>

      {mode && (
        <Overlay onDismiss={close} label={mode === 'everything' ? 'Clear everything?' : 'Clear activity?'}>
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 hairline shadow-[var(--shadow-lifted)]">
            <h3 id="reset-title" className="text-headline-md">
              {mode === 'everything' ? 'Clear everything?' : 'Clear activity?'}
            </h3>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              {mode === 'everything'
                ? "This deletes every service, team, role, checklist, template, inventory item and account except your own. There's no undo and no backup — anything you still need should be exported first."
                : "This deletes every service and everything recorded against it, plus the message board. Teams, roles, members, templates and inventory are left alone. There's no undo."}
            </p>

            {needsPhrase && (
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-body-sm text-on-surface-variant">
                  Type <span className="font-mono text-on-surface">{CONFIRM_PHRASE}</span> to confirm
                </span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  className={inputClasses}
                />
              </label>
            )}

            {error && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <ActionButton tone="quiet" onClick={close}>
                Cancel
              </ActionButton>
              <ActionButton
                tone="danger"
                onClick={() => reset.mutate(mode)}
                disabled={reset.isPending || !canConfirm}
              >
                {reset.isPending
                  ? 'Resetting…'
                  : mode === 'everything'
                    ? 'Yes, clear everything'
                    : 'Yes, clear activity'}
              </ActionButton>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

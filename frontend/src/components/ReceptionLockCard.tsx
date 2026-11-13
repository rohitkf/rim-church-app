import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Pill, Tile, inputClasses } from './Surface'
import { LockIcon } from './icons'
import { useErrorText } from '../lib/useErrorText'
import { usePermissions } from '../lib/usePermissions'
import { formatRelativeTime } from '../lib/relativeTime'
import { PERMISSIONS_KEY } from '../lib/usePermissions'
import { REGISTRATIONS_KEY } from '../lib/registrations'
import { LOCK_NOTE_MAX, RECEPTION_LOCK_KEY, lockedByWords, setReceptionLock, useReceptionLock } from '../lib/receptionLock'

/**
 * The key to Reception (0288): whether it is locked, and the button that
 * turns it, for whoever runs registrations. On the Reception page itself
 * and in Settings › Reception — the same card, so the key is where the
 * door is as well as where the settings are.
 *
 * Locking asks one thing first, and it is optional: a line for the people
 * turned away ("Opens at 9 on Saturday"). Unlocking asks nothing.
 */
export function ReceptionLockCard({ className = '' }: { className?: string }) {
  const lock = useReceptionLock({ watch: true })
  const { can } = usePermissions()
  // Read as a preview narrows it: an Admin previewing a Team Member sees no key.
  const mayTurn = can('reg.manage')
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const noteId = useId()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const turn = useMutation({
    mutationFn: (locked: boolean) => setReceptionLock(locked, locked ? note.trim() || null : null),
    onSuccess: (state) => {
      setError(null)
      setAsking(false)
      setNote('')
      queryClient.setQueryData(RECEPTION_LOCK_KEY, state)
      // What the door's people may see has just changed.
      void queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change the lock just now.')),
  })

  if (!mayTurn && !lock.locked) return null

  return (
    <Tile as="section" tone={lock.locked ? 'warning' : 'plain'} className={className}>
      <div aria-label="Reception lock" role="group" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body-md font-medium text-on-surface">
            <LockIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
            {lock.locked ? 'Reception is locked' : 'Reception is open'}
            <Pill tone={lock.locked ? 'orange' : 'green'} dot>
              {lock.locked ? 'Locked' : 'Open'}
            </Pill>
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {lock.locked
              ? 'Nobody given Reception can open it, check anybody in, take a payment or register a walk-in until it is unlocked. Whoever runs registrations still can.'
              : 'Everybody given Reception can use it. Lock it when no event is on, so nothing is pressed by mistake.'}
          </p>
          {lock.locked && lock.note && (
            <p className="mt-1 text-body-sm text-on-surface">
              <span className="text-on-surface-variant">They are told: </span>
              <span className="[overflow-wrap:anywhere]">{lock.note}</span>
            </p>
          )}
          {(lock.changed_at || lock.changed_by) && (
            <p className="mt-1 text-label-sm text-on-surface-faint">{lockedByWords(lock, formatRelativeTime)}</p>
          )}
        </div>
        {mayTurn && !asking && (
          <ActionButton
            className="self-start sm:self-center"
            tone={lock.locked ? 'success' : 'quiet'}
            disabled={turn.isPending}
            onClick={() => (lock.locked ? turn.mutate(false) : setAsking(true))}
          >
            {lock.locked ? (turn.isPending ? 'Unlocking…' : 'Unlock Reception') : 'Lock Reception'}
          </ActionButton>
        )}
      </div>

      {mayTurn && asking && (
        <form
          className="mt-4 flex flex-col gap-3"
          aria-label="Lock Reception"
          onSubmit={(e) => {
            e.preventDefault()
            turn.mutate(true)
          }}
        >
          <label htmlFor={noteId} className="text-label-md font-medium text-on-surface">
            A line for whoever is turned away <span className="font-normal text-on-surface-variant">(optional)</span>
          </label>
          <input
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={LOCK_NOTE_MAX}
            placeholder="Opens at 9 on Saturday"
            className={inputClasses}
          />
          <div className="flex flex-wrap gap-2">
            <ActionButton type="submit" disabled={turn.isPending}>
              {turn.isPending ? 'Locking…' : 'Lock Reception'}
            </ActionButton>
            <ActionButton tone="ghost" onClick={() => setAsking(false)} disabled={turn.isPending}>
              Keep it open
            </ActionButton>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
    </Tile>
  )
}

/** What somebody given Reception meets while it is locked: why, and that nothing of theirs has changed. */
export function ReceptionLocked({ note }: { note: string | null }) {
  return (
    <Tile as="section" tone="warning" className="text-center">
      <LockIcon aria-hidden="true" className="mx-auto h-8 w-8 text-on-surface-variant" />
      <h2 className="mt-3 text-headline-md text-on-surface">Reception is locked</h2>
      <p className="mx-auto mt-2 max-w-md text-body-md text-on-surface-variant">
        Whoever runs registrations has locked it for now, so nothing here can be opened or pressed. Your access has not
        been taken away: this page opens again as soon as it is unlocked.
      </p>
      {note && <p className="mx-auto mt-3 max-w-md text-body-md font-medium text-on-surface [overflow-wrap:anywhere]">{note}</p>}
    </Tile>
  )
}

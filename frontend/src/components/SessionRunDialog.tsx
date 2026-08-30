import { type FormEvent, useState } from 'react'
import { Overlay, ActionButton, inputClasses } from './Surface'
import { formatTime } from '../lib/time'
import type { RunSession } from '../lib/sessionRunPlan'

export type RunAction = 'start' | 'skip'

/**
 * Confirming a change to a service that is happening right now.
 *
 * These two buttons move every time after them and, between them, are the
 * only way to record that something did not happen — pressed by somebody
 * holding a phone at the back of a room, one-handed, in the dark. A stray
 * thumb should not be able to rewrite the running order, so both stop here
 * first and say plainly what is about to change.
 *
 * The dialog is told what the plan will do rather than describing it in its
 * own words, so the sentence and the write cannot drift apart.
 */
export function SessionRunDialog({
  action,
  session,
  jumped,
  at,
  busy,
  onConfirm,
  onClose,
}: {
  action: RunAction
  session: RunSession
  /** For a start: the sessions this jumps over, which get marked skipped. */
  jumped: RunSession[]
  /** The minute this will be recorded as. */
  at: number
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const starting = action === 'start'
  const time = formatTime(new Date(at).toISOString())
  // A reason is asked for whenever something is being dropped — on a skip
  // always, on a start only when it jumps over something.
  const dropping = starting ? jumped.length > 0 : true

  return (
    <Overlay
      label={starting ? `Start ${session.session_name}` : `Skip ${session.session_name}`}
      align="sheet"
      onDismiss={onClose}
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onConfirm(reason)
        }}
        className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]"
      >
        <h2 className="text-headline-md">
          {starting ? `Start ${session.session_name}?` : `Skip ${session.session_name}?`}
        </h2>

        <p className="mt-2 text-body-sm text-on-surface-variant">
          {starting ? (
            <>
              It will be recorded as starting at{' '}
              <span className="font-mono text-on-surface">{time}</span>, and everything after it
              moves to match.
            </>
          ) : (
            <>
              It stays in the running order marked as skipped, takes no time, and everything after
              it moves up.
            </>
          )}
        </p>

        {jumped.length > 0 && (
          <div className="mt-4 rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--color-accent-orange)_9%,transparent)] px-3.5 py-3">
            <p className="text-label-md text-accent-orange-soft">
              {jumped.length === 1
                ? 'This jumps over one session, which will be marked skipped:'
                : `This jumps over ${jumped.length} sessions, which will be marked skipped:`}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {jumped.map((s) => (
                <li key={s.id} className="truncate text-body-sm text-on-surface">
                  {s.session_name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dropping && (
          <label className="mt-4 block">
            <span className="text-label-md text-on-surface-variant">
              Why? <span className="text-on-surface-faint">Optional, but worth a few words.</span>
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ran out of time"
              className={`${inputClasses} mt-1.5`}
            />
          </label>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
          <ActionButton type="submit" disabled={busy} tone={starting ? 'primary' : 'quiet'}>
            {busy ? 'Saving…' : starting ? 'Yes, start it now' : 'Yes, skip it'}
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}

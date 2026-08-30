import { type FormEvent, useState } from 'react'
import { Overlay, ActionButton, inputClasses } from './Surface'
import { formatTime, timeInputValue, withClockTime } from '../lib/time'
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
 *
 * A start can also be back-dated. Somebody notices five minutes late that the
 * sermon began, and the honest record is when it began, not when they got to
 * their phone — so the time is editable, and everything the dialog says about
 * the change follows the time in the box rather than the clock.
 */
export function SessionRunDialog({
  action,
  session,
  jumpedAt,
  at,
  earliest,
  busy,
  onConfirm,
  onClose,
}: {
  action: RunAction
  session: RunSession
  /**
   * For a start: which sessions get jumped over if it happened at this
   * moment. A function rather than a list, because changing the time changes
   * the answer, and a dialog naming the wrong sessions is worse than one
   * naming none.
   */
  jumpedAt: (at: number) => RunSession[]
  /** The minute this will be recorded as, unless it is edited below. */
  at: number
  /**
   * When the session before this one began — nothing here can have started
   * earlier than that. Null for the first session, which has no floor.
   */
  earliest: number | null
  busy: boolean
  onConfirm: (reason: string, at: number) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [clock, setClock] = useState(() => timeInputValue(new Date(at).toISOString()))
  const starting = action === 'start'
  // A half-typed time leaves the moment where it was rather than throwing the
  // dialog back to midnight while somebody is still typing.
  const chosen = (starting ? withClockTime(at, clock) : null) ?? at
  /*
   * A session cannot have started before the one in front of it.
   *
   * Left unchecked this is not merely wrong, it is quietly destructive: a
   * time earlier than the previous session's start means nothing was running
   * at that moment, so the previous session reads as jumped over and gets
   * marked as never having happened. Which is the last thing somebody
   * correcting a time by five minutes intends.
   */
  const tooEarly = earliest !== null && chosen < earliest
  const jumped = starting && !tooEarly ? jumpedAt(chosen) : []
  const time = formatTime(new Date(chosen).toISOString())
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
          if (tooEarly) return
          onConfirm(reason, chosen)
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

        {starting && (
          <label className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-label-md text-on-surface-variant">Started at</span>
            <input
              type="time"
              value={clock}
              onChange={(e) => setClock(e.target.value)}
              min={earliest === null ? undefined : timeInputValue(new Date(earliest).toISOString())}
              aria-label={`Time ${session.session_name} started`}
              className={`rounded-[var(--radius-chip)] bg-raised px-3 py-2 font-mono text-body-md text-on-surface [color-scheme:dark] focus:outline-none focus:ring-1 ${
                tooEarly ? 'ring-1 ring-error' : 'hairline focus:ring-secondary'
              }`}
            />
          </label>
        )}

        {tooEarly && earliest !== null && (
          <p className="mt-2 text-label-md text-error">
            It cannot have started before the session in front of it, which began at{' '}
            <span className="font-mono">{formatTime(new Date(earliest).toISOString())}</span>.
          </p>
        )}

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
          <ActionButton type="submit" disabled={busy || tooEarly} tone={starting ? 'primary' : 'quiet'}>
            {busy ? 'Saving…' : starting ? 'Yes, start it now' : 'Yes, skip it'}
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}

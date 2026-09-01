import { type FormEvent, useState } from 'react'
import { ActionButton, Overlay, inputClasses } from './Surface'
import { NumberDial } from './NumberDial'
import { formatDuration } from '../lib/duration'
import { grantedMinutes, plannedMinutes, runsForMinutes } from '../lib/sessionLength'
import type { RunSession } from '../lib/sessionRunPlan'

const QUICK = [5, 10, 15]

/**
 * Granting a session more time, because somebody in the room asked.
 *
 * The amounts are buttons rather than a number field, because this gets
 * pressed while a service is running and "ten more minutes" is what was
 * actually said. The note is what makes it a grant rather than a correction:
 * next month's plan should be able to see that the sermon ran to forty
 * because it was given ten, not because forty was ever the plan.
 */
export function AddTimeDialog({
  session,
  busy,
  onConfirm,
  onClose,
}: {
  session: RunSession
  busy: boolean
  onConfirm: (minutes: number, note: string) => void
  onClose: () => void
}) {
  const [minutes, setMinutes] = useState(10)
  const [note, setNote] = useState('')

  const planned = plannedMinutes(session)
  const granted = grantedMinutes(session)
  const now = runsForMinutes(session)

  return (
    <Overlay label={`Add time to ${session.session_name}`} align="sheet" onDismiss={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (minutes > 0) onConfirm(minutes, note)
        }}
        className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]"
      >
        <h2 className="text-headline-md">More time for {session.session_name}</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Planned for <span className="font-mono text-on-surface">{formatDuration(planned)}</span>
          {granted > 0 && (
            <>
              , running to{' '}
              <span className="font-mono text-on-surface">{formatDuration(now)}</span> with the{' '}
              {granted} minutes already asked for
            </>
          )}
          . The planned length stays as it is; everything after this moves by what you add.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMinutes(n)}
              className={`tap rounded-full px-4 py-2 text-body-sm font-medium transition-all duration-500 ease-[var(--ease-glide)] ${
                minutes === n ? 'bg-primary text-on-primary' : 'hairline text-on-surface'
              }`}
            >
              +{n} min
            </button>
          ))}
        </div>

        {/* The quick buttons cover the usual asks; the ruler is for the one
            that is not five, ten or fifteen. */}
        <NumberDial
          value={minutes}
          onChange={setMinutes}
          min={1}
          max={120}
          majorEvery={5}
          unit="min"
          label="Minutes to add"
          className="mt-4"
        />

        <label className="mt-4 block">
          <span className="text-label-md text-on-surface-variant">
            Who asked? <span className="text-on-surface-faint">Optional.</span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Pastor asked for ten more"
            className={`${inputClasses} mt-1.5`}
          />
        </label>

        <p className="mt-4 text-label-md text-on-surface-variant">
          New length: <span className="font-mono text-on-surface">{formatDuration(now + Math.max(minutes || 0, 0))}</span>
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
          <ActionButton type="submit" disabled={busy || !(minutes > 0)}>
            {busy ? 'Adding…' : `Add ${minutes > 0 ? minutes : 0} min`}
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}

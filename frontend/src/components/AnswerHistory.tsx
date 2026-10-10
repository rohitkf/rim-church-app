import { useId, useState } from 'react'
import { describeChange, formatChangedAt, type AvailabilityHistoryEntry } from '../lib/availabilityHistory'
import type { AvailabilityStatus } from '../lib/types'

const TONE: Record<AvailabilityStatus, string> = {
  available: 'text-success',
  tentative: 'text-warning',
  unavailable: 'text-error',
}

/**
 * The record behind one answer: every time it was given, changed or taken
 * away, oldest first.
 *
 * Folded under the name until asked for. The tracker is read for who can
 * serve, and a column of timestamps under every name would bury that; the
 * log is for the question asked about one person — "when did they
 * actually say no?"
 */
export function AnswerHistory({
  entries,
  whose,
  label = 'History',
}: {
  entries: readonly AvailabilityHistoryEntry[]
  /** Read out with the list: "Joel Skaria's answer". */
  whose: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (entries.length === 0) return null

  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="tap font-mono text-label-sm text-on-surface-faint hover:text-secondary hover:underline"
      >
        {open ? `Hide ${label.toLowerCase()}` : `${label} · ${entries.length}`}
      </button>
      {open && (
        <ol
          id={id}
          aria-label={`History of ${whose}`}
          className="mt-1.5 flex flex-col gap-2 border-l border-border-subtle pl-3"
        >
          {entries.map((entry, i) => {
            const line = describeChange(entry)
            // The note only when it is news: a status changed under the
            // same note has nothing new to say about it.
            const noteIsNew = !!line.note && (entry.kind === 'note' || line.note !== (entries[i - 1]?.note ?? null))
            return (
              <li key={entry.id} className="text-label-md">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={`font-medium ${line.status ? TONE[line.status] : 'text-on-surface-variant'}`}>
                    {line.what}
                  </span>
                  {line.was && <span className="text-on-surface-faint">{line.was}</span>}
                  {line.late && (
                    <span className="rounded-full bg-raised-strong px-1.5 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                      After answers closed
                    </span>
                  )}
                </div>
                <p className="font-mono text-label-sm tabular text-on-surface-faint">
                  <time dateTime={entry.changed_at}>
                    {line.beforeLog ? `as of ${formatChangedAt(entry.changed_at)}` : formatChangedAt(entry.changed_at)}
                  </time>
                  {line.who && ` · ${line.who}`}
                </p>
                {noteIsNew && (
                  <p className="break-words text-on-surface-variant">
                    <span aria-hidden="true">“</span>
                    {line.note}
                    <span aria-hidden="true">”</span>
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

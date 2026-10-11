import { useEffect, useId, useState } from 'react'
import { findPeople, type Suggestion } from '../lib/family'
import { inputClasses } from './Surface'

/**
 * A name box that suggests accounts as you type.
 *
 * Choosing a suggestion hands back the account; carrying on without one
 * hands back what was typed, for writing the person in by hand. The two
 * are offered side by side because most children will never have an
 * account, and the box must not make that feel like a dead end.
 */
export function PersonPicker({
  label,
  placeholder = 'Start typing their name',
  myId,
  onPick,
  onWriteIn,
}: {
  label: string
  placeholder?: string
  myId?: string
  onPick: (person: Suggestion) => void
  onWriteIn: (typed: string) => void
}) {
  const [typed, setTyped] = useState('')
  const [found, setFound] = useState<Suggestion[]>([])
  const listId = useId()

  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      findPeople(typed, myId)
        .then((people) => live && setFound(people))
        .catch(() => live && setFound([]))
    }, 200)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [typed, myId])

  const shown = typed.trim().length >= 2 ? found : []

  return (
    <div className="flex flex-col gap-2">
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label={label}
        aria-controls={listId}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClasses}
      />
      {shown.length > 0 && (
        <ul id={listId} aria-label="People on the app" className="flex flex-col gap-1 rounded-[var(--radius-chip)] bg-raised p-1 hairline">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-chip)] px-3 py-2 text-left text-body-sm text-on-surface hover:bg-raised-strong"
              >
                <span className="min-w-0 break-words">
                  {p.first_name} {p.last_name}
                </span>
                <span className="shrink-0 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                  On the app
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {typed.trim().length >= 2 && (
        <button
          type="button"
          onClick={() => onWriteIn(typed.trim())}
          className="tap self-start text-label-md text-secondary hover:underline"
        >
          Not on the app? Add “{typed.trim()}” by hand
        </button>
      )}
    </div>
  )
}

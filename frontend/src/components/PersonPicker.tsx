import { useEffect, useId, useState } from 'react'
import { findPeople, type Suggestion } from '../lib/family'
import { nameMatches } from '../lib/families'
import { guestLabel, type Guest } from '../lib/guests'
import { inputClasses } from './Surface'

/**
 * A name box that suggests accounts as you type.
 *
 * Choosing a suggestion hands back the account; carrying on without one
 * hands back what was typed, for writing the person in by hand. The two
 * are offered side by side because most children will never have an
 * account, and the box must not make that feel like a dead end.
 *
 * `guests` are the people on the guest roll who have no account yet
 * (0091). Where they are handed in, a name typed finds them too, marked
 * "On the guest list", so somebody the church already knows is not typed
 * in a second time under another spelling: the same name in both places
 * is what lets them be linked in one step when they join (0332).
 */
export function PersonPicker({
  label,
  placeholder = 'Start typing their name',
  myId,
  onPick,
  onWriteIn,
  guests,
  onPickGuest,
}: {
  label: string
  placeholder?: string
  myId?: string
  onPick: (person: Suggestion) => void
  /** Left out where only an account will do (linking two accounts, 0319): nothing is offered by hand. */
  onWriteIn?: (typed: string) => void
  /** The guest roll's people still without an account; left out, none are offered. */
  guests?: readonly Guest[]
  onPickGuest?: (guest: Guest) => void
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
  const onTheRoll =
    guests && onPickGuest && typed.trim().length >= 2
      ? guests.filter((g) => !g.became_member && nameMatches(guestLabel(g), typed)).slice(0, 6)
      : []

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
                <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">
                  On the app
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onTheRoll.length > 0 && onPickGuest && (
        <ul aria-label="People on the guest list" className="flex flex-col gap-1 rounded-[var(--radius-chip)] bg-raised p-1 hairline">
          {onTheRoll.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPickGuest(g)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-chip)] px-3 py-2 text-left text-body-sm text-on-surface hover:bg-raised-strong"
              >
                <span className="min-w-0 break-words">{guestLabel(g)}</span>
                <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">On the guest list</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onWriteIn && typed.trim().length >= 2 && (
        <button
          type="button"
          onClick={() => onWriteIn(typed.trim())}
          className="tap self-start text-label-md text-accent-blue-soft hover:underline"
        >
          Not on the app? Add “{typed.trim()}” by hand
        </button>
      )}
    </div>
  )
}

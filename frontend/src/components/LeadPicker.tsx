import { useEffect, useMemo, useRef, useState } from 'react'
import type { PersonRef } from '../lib/sessionAssignees'

export interface LeadOption {
  /** 'member' ids are profile ids; 'guest' ids are rows on the guest roll. */
  kind: 'member' | 'guest'
  id: string
  name: string
  /** Shown under the name for a guest — "Guest speaker", and the like. */
  note?: string | null
}

/** Who a row refers to. The same pair the assignee rows are written with. */
export type LeadValue = PersonRef

/** A name as it is compared: case and stray spaces make nobody different. */
function sameName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Who is taking this session — as many people as it takes.
 *
 * A native select was fine for a church of twelve and useless at eighty:
 * finding one person meant scrolling a list in whatever order the database
 * felt like, with no way to type a name. This is a combobox — type to
 * narrow, arrows to move, Enter to take — and it keeps members and guests
 * in separate groups so a visiting speaker is never mistaken for someone
 * on the rota.
 *
 * It takes a list rather than a name, because most of a running order is
 * shared work: worship is a team, communion is served by several people,
 * and a guest speaker is introduced by somebody. Picking does not close
 * the list — naming four people should be four taps, not four trips — so
 * it closes on Escape, on Done, or on a click anywhere else.
 *
 * Filtering matches anywhere in the name rather than only the start,
 * because people search by surname at least as often as by first name.
 */
export function LeadPicker({
  values,
  options,
  onChange,
  label,
  onAddGuest,
}: {
  values: LeadValue[]
  options: LeadOption[]
  onChange: (next: LeadValue[]) => void
  label: string
  /**
   * Put the name that was just typed on the guest roll, and hand back who
   * it became so this picker can assign them on the spot.
   *
   * Left out for anybody who may not add one, which is what makes the row
   * appear only for the people it would work for. See the row itself for
   * why it exists at all.
   */
  onAddGuest?: (name: string) => Promise<LeadValue | null>
}) {
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const keyOf = (value: { kind: string; id: string }) => `${value.kind}:${value.id}`
  const chosenKeys = useMemo(() => new Set(values.map(keyOf)), [values])

  // The people on this session, in the order they were put there, named
  // from the options list — a name that has since gone (a guest removed
  // from the roll) simply stops being offered and stops being shown.
  const chosen = useMemo(
    () =>
      values
        .map((value) => options.find((o) => o.kind === value.kind && o.id === value.id))
        .filter((o): o is LeadOption => !!o),
    [values, options],
  )

  const matches = useMemo(() => {
    const needle = sameName(query)
    if (!needle) return options
    return options.filter((o) => sameName(o.name).includes(needle))
  }, [options, query])

  /*
   * Whether what is typed is somebody new.
   *
   * It used to be "nothing matched", and matching is by any part of the
   * name — so typing Reji with Sumi Reji on the guest list found her, and
   * the offer to add Reji as a person in his own right never appeared.
   * Two people can share a word of a name; they cannot share all of it.
   * So the offer stands unless somebody is already called exactly this.
   */
  const typed = query.trim()
  const canAdd = useMemo(() => {
    if (!onAddGuest || !typed) return false
    return !options.some((o) => sameName(o.name) === sameName(typed))
  }, [onAddGuest, typed, options])

  // Nobody is always the first row, so clearing a session is one key away
  // rather than a hunt back to the top of the list. Adding the typed name,
  // when it is on offer, is the last — after everybody it might have meant.
  const rows: (LeadOption | null | 'add')[] = useMemo(
    () => [null, ...matches, ...(canAdd ? (['add'] as const) : [])],
    [matches, canAdd],
  )

  useEffect(() => {
    if (!open) return
    const onClickAway = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  /** On if they were off, off if they were on. The list stays open either way. */
  function toggle(option: LeadOption | null) {
    if (!option) {
      onChange([])
      return
    }
    const value: LeadValue = { kind: option.kind, id: option.id }
    onChange(
      chosenKeys.has(keyOf(value))
        ? values.filter((v) => keyOf(v) !== keyOf(value))
        : [...values, value],
    )
    setQuery('')
  }

  function remove(option: LeadOption) {
    onChange(values.filter((v) => keyOf(v) !== keyOf(option)))
  }

  /*
   * The name in the box is a person nobody has heard of.
   *
   * Which used to be the end of the road: "Nobody by that name. Add a
   * guest on the right if they don't have an account" — a sentence that
   * asks somebody mid-assignment to go somewhere else, do a second job,
   * and come back. They are already holding the name. This takes it.
   */
  async function addTypedName() {
    const name = query.trim()
    if (!onAddGuest || !name || adding) return
    setAdding(true)
    try {
      const made = await onAddGuest(name)
      if (made && !chosenKeys.has(keyOf(made))) {
        onChange([...values, made])
        setQuery('')
      }
    } finally {
      setAdding(false)
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => (i + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => (i - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = rows[Math.min(highlighted, rows.length - 1)] ?? null
      if (picked === 'add') {
        void addTypedName()
        return
      }
      // Typing puts the highlight back on the first row, which is
      // Unassigned — so Enter after a name nobody matched used to clear
      // everybody already on the session. With a name in the box, Enter
      // is never a request for nobody.
      if (picked === null && typed) return
      toggle(picked)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  const members = matches.filter((o) => o.kind === 'member')
  const guests = matches.filter((o) => o.kind === 'guest')
  const indexOf = (option: LeadOption) => rows.findIndex((r) => r === option)
  const addIndex = rows.indexOf('add')

  function row(option: LeadOption) {
    const index = indexOf(option)
    const on = chosenKeys.has(keyOf(option))
    return (
      <li key={`${option.kind}-${option.id}`}>
        <button
          type="button"
          aria-pressed={on}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setHighlighted(index)}
          onClick={() => toggle(option)}
          className={`flex w-full items-center gap-2 rounded-[var(--radius-row)] px-3 py-2 text-left ${
            index === highlighted ? 'bg-raised-strong' : ''
          }`}
        >
          {/* A tick that is always there, lit or not, so a name does not
              shift sideways the moment it is chosen. */}
          <span
            aria-hidden="true"
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ${
              on ? 'bg-secondary text-on-secondary' : 'hairline'
            }`}
          >
            {on && (
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm text-on-surface">{option.name}</span>
            {option.note && (
              <span className="block text-label-sm text-on-surface-faint">{option.note}</span>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div ref={boxRef} className="relative flex flex-wrap items-center gap-1.5">
      {/* Who is on it, each one removable where they are shown rather than
          back inside a list that has to be opened to find them. */}
      {chosen.map((option) => (
        <span
          key={`${option.kind}-${option.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-raised-strong py-1 pl-3 pr-1 text-label-md text-on-surface hairline"
        >
          <span className="break-words">{option.name}</span>
          {option.kind === 'guest' && (
            <span className="shrink-0 rounded-full bg-secondary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-secondary">
              Guest
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove ${option.name}`}
            onClick={() => remove(option)}
            className="tap flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-raised hover:text-on-surface"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      ))}

      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((wasOpen) => !wasOpen)
          setHighlighted(0)
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        onKeyDown={onKeyDown}
        className="tap flex items-center gap-2 rounded-full bg-raised-strong px-3 py-2 text-left text-label-md text-on-surface hairline"
      >
        <span className="min-w-0 break-words text-left">
          {chosen.length === 0 ? 'Unassigned' : 'Add someone'}
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-on-surface-variant"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-[var(--radius-card)] bg-surface-low p-1.5 shadow-[var(--shadow-lifted)] hairline-strong">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              // With something typed, the first thing it could mean — not
              // Unassigned, which is never what a name is looking for.
              setHighlighted(e.target.value.trim() ? 1 : 0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search people…"
            aria-label="Search people"
            className="w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
          />

          <ul role="listbox" aria-label={label} className="mt-1.5 max-h-64 overflow-y-auto">
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(0)}
                onClick={() => toggle(null)}
                className={`w-full rounded-[var(--radius-row)] px-3 py-2 text-left text-body-sm text-on-surface-variant ${
                  highlighted === 0 ? 'bg-raised-strong' : ''
                }`}
              >
                Unassigned
              </button>
            </li>

            {members.length > 0 && (
              <li className="px-3 pb-1 pt-2 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                Team
              </li>
            )}
            {members.map(row)}

            {guests.length > 0 && (
              <li className="px-3 pb-1 pt-2 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                Guests
              </li>
            )}
            {guests.map(row)}

            {canAdd && (
              <li className={matches.length > 0 ? 'mt-1.5' : ''}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlighted(addIndex)}
                  onClick={addTypedName}
                  disabled={adding}
                  className={`flex w-full flex-col items-start rounded-[var(--radius-row)] px-3 py-2.5 text-left disabled:opacity-60 ${
                    highlighted === addIndex ? 'bg-raised-strong' : 'bg-secondary/10'
                  }`}
                >
                  <span className="break-words text-body-sm text-on-surface">
                    {adding
                      ? 'Adding…'
                      : matches.length > 0
                        ? `Add “${typed}” as a new guest`
                        : `Add “${typed}” as a guest`}
                  </span>
                  <span className="text-label-sm text-on-surface-faint">
                    {/* Said when there are matches above, because the
                        question then is whether this is one of them. */}
                    {matches.length > 0
                      ? 'Someone else — not anyone listed above'
                      : 'Goes on the guest list for next time too'}
                  </span>
                </button>
              </li>
            )}

            {matches.length === 0 && !canAdd && (
              <li className="px-3 py-3 text-body-sm text-on-surface-variant">
                Nobody by that name. An Admin can add them to the guest list on Volunteers.
              </li>
            )}
          </ul>

          {/* The list stays open while people are being picked, so it needs
              a way out that is not "click somewhere harmless". */}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setQuery('')
            }}
            className="tap mt-1 w-full rounded-[var(--radius-row)] px-3 py-2 text-label-md text-on-surface-variant hover:bg-raised-strong"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}

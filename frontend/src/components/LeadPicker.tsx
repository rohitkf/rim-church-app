import { useEffect, useMemo, useRef, useState } from 'react'

export interface LeadOption {
  /** 'member' ids are profile ids; 'guest' ids are service_guests ids. */
  kind: 'member' | 'guest'
  id: string
  name: string
  /** Shown under the name for a guest — "Guest speaker", and the like. */
  note?: string | null
}

export interface LeadValue {
  kind: 'member' | 'guest'
  id: string
}

/**
 * Who is taking this session.
 *
 * A native select was fine for a church of twelve and useless at eighty:
 * finding one person meant scrolling a list in whatever order the database
 * felt like, with no way to type a name. This is a combobox — type to
 * narrow, arrows to move, Enter to take — and it keeps members and guests
 * in separate groups so a visiting speaker is never mistaken for someone
 * on the rota.
 *
 * Filtering matches anywhere in the name rather than only the start,
 * because people search by surname at least as often as by first name.
 */
export function LeadPicker({
  value,
  options,
  onChange,
  label,
}: {
  value: LeadValue | null
  options: LeadOption[]
  onChange: (next: LeadValue | null) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = value
    ? options.find((o) => o.kind === value.kind && o.id === value.id) ?? null
    : null

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.name.toLowerCase().includes(needle))
  }, [options, query])

  // Unassigned is always the first row, so clearing someone is one key away
  // rather than a hunt back to the top of the list.
  const rows: (LeadOption | null)[] = useMemo(() => [null, ...matches], [matches])

  useEffect(() => {
    if (!open) return
    const onClickAway = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  function commit(option: LeadOption | null) {
    onChange(option ? { kind: option.kind, id: option.id } : null)
    setOpen(false)
    setQuery('')
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
      commit(rows[Math.min(highlighted, rows.length - 1)] ?? null)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  const members = matches.filter((o) => o.kind === 'member')
  const guests = matches.filter((o) => o.kind === 'guest')
  const indexOf = (option: LeadOption) => rows.findIndex((r) => r === option)

  function row(option: LeadOption) {
    const index = indexOf(option)
    return (
      <li key={`${option.kind}-${option.id}`}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setHighlighted(index)}
          onClick={() => commit(option)}
          className={`flex w-full flex-col items-start rounded-[var(--radius-row)] px-3 py-2 text-left ${
            index === highlighted ? 'bg-raised-strong' : ''
          }`}
        >
          <span className="text-body-sm text-on-surface">{option.name}</span>
          {option.note && (
            <span className="text-label-sm text-on-surface-faint">{option.note}</span>
          )}
        </button>
      </li>
    )
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
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
        className="tap flex w-44 items-center gap-2 rounded-full bg-raised-strong px-3 py-2 text-left text-label-md text-on-surface hairline"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.name : 'Unassigned'}
        </span>
        {selected?.kind === 'guest' && (
          <span className="shrink-0 rounded-full bg-secondary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-secondary">
            Guest
          </span>
        )}
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
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-[var(--radius-card)] bg-surface-low p-1.5 shadow-[var(--shadow-lifted)] hairline-strong">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlighted(0)
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
                onClick={() => commit(null)}
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

            {matches.length === 0 && (
              <li className="px-3 py-3 text-body-sm text-on-surface-variant">
                Nobody by that name. Add a guest on the right if they don&rsquo;t have an account.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

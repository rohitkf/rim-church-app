import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActionButton, Overlay, inputClasses } from './Surface'
import { Chevron } from './Collapsible'
import { groupCapabilities, searchGroups } from '../lib/permissionGroups'
import type { CapabilityKey } from '../lib/permissions'

/**
 * Choose rights by ticking them.
 *
 * What "Give them one thing more…" used to be: a menu of every right there
 * is, as sentences, in alphabetical order, one at a time. Here they are
 * under the area each belongs to (lib/permissionGroups), each area shut
 * until it is opened or a search finds something in it, and as many as
 * are wanted are ticked before anything is sent.
 *
 * The dialog only chooses. What is done with the choice (given, blocked,
 * how far, until when) is the caller's: `options` is drawn above the
 * buttons once something is ticked, and `onConfirm` gets the keys.
 */
export function PermissionPicker({
  title,
  lead,
  choices,
  picked,
  onPickedChange,
  verb,
  onConfirm,
  onClose,
  saving = false,
  error = null,
  options,
  hintFor,
}: {
  title: string
  lead: string
  /** The rights that can be chosen here: ones already held are left out by the caller. */
  choices: readonly CapabilityKey[]
  picked: readonly CapabilityKey[]
  onPickedChange: (next: CapabilityKey[]) => void
  /** "Give", "Block": the button says it with how many. */
  verb: string
  onConfirm: () => void
  onClose: () => void
  saving?: boolean
  error?: string | null
  /** How the chosen rights are to be given, shown once there is one. */
  options?: ReactNode
  /** A word beside a right that is not like the others: "Everywhere only". */
  hintFor?: (key: CapabilityKey) => string | null
}) {
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const groups = useMemo(() => groupCapabilities(choices), [choices])
  const shown = useMemo(() => searchGroups(groups, typed), [groups, typed])
  const chosen = useMemo(() => new Set(picked), [picked])
  const searching = typed.trim().length > 0

  // The keyboard comes with the popup: without this, Tab went on through
  // the page behind it. The sheet itself takes the focus rather than the
  // search box, which on a phone would open the keys over the list.
  const sheet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    sheet.current?.focus()
  }, [])

  const toggle = (key: CapabilityKey) =>
    onPickedChange(chosen.has(key) ? picked.filter((k) => k !== key) : [...picked, key])
  const setArea = (keys: readonly CapabilityKey[], on: boolean) => {
    const rest = picked.filter((k) => !keys.includes(k))
    onPickedChange(on ? [...rest, ...keys] : rest)
  }

  return (
    <Overlay label={title} onDismiss={onClose} align="sheet" closable={!saving}>
      <div ref={sheet} tabIndex={-1} className="flex max-h-[94svh] w-full max-w-lg flex-col outline-none rounded-t-[var(--radius-tile)] bg-surface-low shadow-[var(--shadow-lifted)] hairline-strong sm:rounded-[var(--radius-tile)]">
        <div className="mx-auto mt-3 h-[5px] w-[38px] shrink-0 rounded-full bg-white/22 sm:hidden" />
        <div className="px-6 pt-5">
          <h2 className="break-words text-headline-md">{title}</h2>
          <p className="mt-1.5 text-body-sm text-on-surface-variant">{lead}</p>
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search: rota, guests, inventory…"
            aria-label="Search the permissions"
            className={`${inputClasses} mt-4`}
          />
        </div>

        <div className="mt-3 min-h-[9rem] flex-1 overflow-y-auto px-6 pb-2">
          {shown.length === 0 ? (
            <p className="py-6 text-body-sm text-on-surface-variant">
              {choices.length === 0 ? 'There is nothing left to choose.' : 'Nothing by those words. Try one word, or the page it is on.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {shown.map((group) => {
                const keys = group.rows.map((r) => r.key)
                const ticked = keys.filter((k) => chosen.has(k)).length
                // A search opens what it finds; otherwise an area is open once it is asked for.
                const isOpen = searching || open.has(group.area)
                const id = `perm-area-${group.area.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
                return (
                  <li key={group.area} className="rounded-[var(--radius-row)] bg-raised hairline">
                    <div className="flex items-center gap-2 pr-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(open)
                          if (next.has(group.area)) next.delete(group.area)
                          else next.add(group.area)
                          setOpen(next)
                        }}
                        aria-expanded={isOpen}
                        aria-controls={id}
                        // While searching every area found is open, and the heading has nothing to do.
                        disabled={searching}
                        className="tap flex min-w-0 flex-1 items-center gap-2 px-3.5 py-3 text-left"
                      >
                        <span className="min-w-0 flex-1 break-words text-body-md font-medium text-on-surface">{group.area}</span>
                        <span className="shrink-0 font-mono text-label-sm text-on-surface-variant">
                          {ticked > 0 ? `${ticked} of ${keys.length}` : keys.length}
                        </span>
                        {!searching && <Chevron open={isOpen} />}
                      </button>
                    </div>
                    <div id={id} hidden={!isOpen} className="border-t border-border-subtle px-3.5 pb-3 pt-2">
                      {keys.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setArea(keys, ticked < keys.length)}
                          disabled={saving}
                          className="tap mb-1 text-label-md text-accent-blue-soft hover:underline"
                        >
                          {ticked < keys.length ? `Tick all ${keys.length}` : 'Untick all'}
                        </button>
                      )}
                      <ul className="flex flex-col">
                        {group.rows.map((row) => {
                          const hint = hintFor?.(row.key) ?? null
                          return (
                            <li key={row.key}>
                              <label className="tap flex cursor-pointer items-start gap-3 rounded-[var(--radius-chip)] py-2">
                                <input
                                  type="checkbox"
                                  id={`perm-${row.key}`}
                                  checked={chosen.has(row.key)}
                                  disabled={saving}
                                  onChange={() => toggle(row.key)}
                                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block break-words text-body-sm font-medium text-on-surface">{row.short}</span>
                                  {row.action && (
                                    <span className="block break-words text-label-md text-on-surface-variant">{row.action}</span>
                                  )}
                                  {hint && <span className="mt-0.5 block font-mono text-label-sm text-on-surface-faint">{hint}</span>}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border-subtle px-6 pb-5 pt-4">
          {/* Its own scroll, and never more than a quarter of the screen: what is ticked must not push the list away. */}
          {picked.length > 0 && options && (
            <div className="mb-3 flex max-h-[24svh] flex-col gap-2 overflow-y-auto">{options}</div>
          )}
          {error && (
            <p role="alert" className="mb-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container [overflow-wrap:anywhere]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-body-sm text-on-surface-variant">
              {picked.length === 0 ? 'Nothing ticked yet' : `${picked.length} ticked`}
            </p>
            <span className="flex flex-wrap gap-2">
              <ActionButton tone="quiet" onClick={onClose} disabled={saving}>
                Cancel
              </ActionButton>
              <ActionButton onClick={onConfirm} disabled={saving || picked.length === 0}>
                {saving ? 'Saving…' : picked.length > 0 ? `${verb} ${picked.length}` : verb}
              </ActionButton>
            </span>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/**
 * How far what is ticked reaches: two choices side by side, where a menu
 * was one more thing to open. Short words, so both fit on a phone beside
 * the date; the whole sentence is the group's name for a screen reader.
 */
export function ReachToggle<R extends string>({
  value,
  onChange,
  choices,
  disabled = false,
}: {
  value: R
  onChange: (next: R) => void
  choices: readonly { value: R; label: string; means: string }[]
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="How far" className="inline-flex shrink-0 rounded-full bg-raised p-1 hairline">
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.means}
          disabled={disabled}
          onClick={() => onChange(c.value)}
          className={`tap rounded-full px-3.5 py-2 text-body-sm font-medium transition-colors duration-200 ${
            value === c.value ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

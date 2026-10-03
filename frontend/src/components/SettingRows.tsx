import { useId, type ReactNode } from 'react'
import { ActionButton, Pill } from './Surface'
import { Chevron } from './Collapsible'

/**
 * The rows every Settings room is built from.
 *
 * A setting is one row: its name, a line saying what it does, and its
 * value as a person would say it. Its control and its full explanation
 * open beneath it (SettingRow) or, when the control is small, sit in the
 * row with the explanation folded (InlineRow). Rooms that read the same
 * way are rooms a person only has to learn once.
 */

export function SettingList({ children }: { children: ReactNode }) {
  return <ul className="-mx-2 flex flex-col">{children}</ul>
}

/** The quiet extras for a row: what it moves, its default, and the full story. */
export function Detail({
  help,
  affects,
  defaultText,
  onDefault,
  folded = false,
}: {
  help: string
  affects: string[]
  defaultText: string
  onDefault?: () => void
  /** Everything behind the disclosure, for a row that has no open state of its own. */
  folded?: boolean
}) {
  const facts = (
    <div className="flex flex-wrap items-center gap-1.5">
      {affects.map((page) => (
        <Pill key={page}>{page}</Pill>
      ))}
      <span className="ml-1 font-mono text-label-sm text-on-surface-faint">default {defaultText}</span>
      {onDefault && (
        <button
          type="button"
          onClick={onDefault}
          className="tap ml-auto rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
        >
          Use default
        </button>
      )}
    </div>
  )
  return (
    <div className={`flex flex-col gap-3 ${folded ? 'mt-1' : 'mt-3'}`}>
      {!folded && facts}
      <details className={`group/how ${folded ? '' : 'rounded-[var(--radius-chip)] bg-raised px-3.5 py-2.5'}`}>
        <summary className="tap inline-flex cursor-pointer list-none items-center text-label-md text-on-surface-faint marker:hidden hover:text-on-surface [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="transition-transform duration-300 group-open/how:rotate-90" aria-hidden="true">
              ›
            </span>
            How this works
          </span>
        </summary>
        <div className={`mt-2 flex flex-col gap-2 ${folded ? 'rounded-[var(--radius-chip)] bg-raised px-3.5 py-3' : ''}`}>
          <p className="text-body-sm text-on-surface-variant">{help}</p>
          {folded && facts}
        </div>
      </details>
    </div>
  )
}

/** A dot that says "you moved this and have not saved it". */
function Unsaved({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <span
      title="Changed, not saved yet"
      aria-label="Changed, not saved yet"
      className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent-orange align-middle"
    />
  )
}

/**
 * A setting whose control needs room: one row that says its value, and
 * opens to the control and the explanation when tapped.
 */
export function SettingRow({
  label,
  summary,
  value,
  changed,
  open,
  onToggle,
  children,
  ...detail
}: {
  label: string
  summary: string
  value: string
  changed: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
  help: string
  affects: string[]
  defaultText: string
  onDefault?: () => void
}) {
  const id = useId()
  return (
    <li className={`rounded-[var(--radius-row)] transition-colors duration-300 ${open ? 'bg-raised' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="tap flex w-full items-center gap-3 rounded-[var(--radius-row)] px-3 py-3 text-left transition-colors duration-300 hover:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-medium text-on-surface">
            {label}
            <Unsaved on={changed} />
          </span>
          <span className="block text-label-md text-on-surface-variant">{summary}</span>
        </span>
        <span className="shrink-0 rounded-full bg-raised-strong px-3 py-1 font-mono text-label-md tabular text-on-surface">
          {value}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div id={id} className="px-3 pb-4">
          {children}
          <Detail {...detail} />
        </div>
      )}
    </li>
  )
}

/**
 * A setting whose control is small enough to sit in the row itself — a
 * switch, a short list, a time. Its explanation still folds away.
 */
export function InlineRow({
  label,
  summary,
  changed,
  children,
  help,
  affects,
  defaultText,
}: {
  label: string
  summary: string
  changed: boolean
  children: ReactNode
  help: string
  affects: string[]
  defaultText: string
}) {
  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-48">
          <span className="block text-body-sm font-medium text-on-surface">
            {label}
            <Unsaved on={changed} />
          </span>
          <span className="block text-label-md text-on-surface-variant">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center">{children}</span>
      </div>
      <Detail help={help} affects={affects} defaultText={defaultText} folded />
    </li>
  )
}

/** On or off, drawn as a switch, still a real checkbox underneath. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  label: string
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="h-7 w-12 rounded-full bg-raised-strong hairline transition-colors duration-300 peer-checked:bg-accent-green peer-focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
      />
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 h-5 w-5 rounded-full bg-on-surface shadow-[var(--shadow-ambient)] transition-transform duration-300 ease-[var(--ease-glide)] peer-checked:translate-x-5 peer-checked:bg-on-primary"
      />
    </label>
  )
}

/**
 * Save follows you down the page.
 *
 * Every control in a room edits a draft, and the only way to keep it was
 * a button at the foot of a card that runs to several screens on a phone.
 * So the honest way to move a dial was: drag it, scroll past four more
 * settings, press Save. Anyone who dragged and left — which is everyone,
 * because a dial that moves looks like a thing that happened — changed
 * nothing, was told nothing, and found the old number waiting next time.
 *
 * The bar sticks to the bottom of the screen instead, above the dock it
 * would otherwise hide behind, and says out loud that there is something
 * unsaved. It only sticks, and grows its own background, when there is:
 * with nothing to save it is an ordinary row at the end of the page,
 * rather than a clear strip floating over the settings above it.
 */
export function SaveBar({
  changed,
  saving,
  saved,
  error,
  onSave,
  onRestore,
  label = 'Save settings',
}: {
  changed: boolean
  saving: boolean
  saved: boolean
  error: string | null
  onSave: () => void
  onRestore?: () => void
  label?: string
}) {
  return (
    <>
      {error && (
        <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
      <div
        className={`z-10 flex flex-wrap items-center gap-3 px-4 py-3 ${
          changed
            ? 'sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] rounded-[var(--radius-card)] bg-surface-lowest/95 shadow-[inset_0_0_0_1px_var(--color-outline-variant)] backdrop-blur sm:bottom-[calc(5.75rem+env(safe-area-inset-bottom))]'
            : ''
        }`}
      >
        <ActionButton onClick={onSave} disabled={!changed || saving}>
          {saving ? 'Saving…' : label}
        </ActionButton>
        {onRestore && (
          <ActionButton tone="quiet" onClick={onRestore}>
            Restore defaults
          </ActionButton>
        )}
        {changed && (
          <span className="text-body-sm text-accent-orange-soft">
            Not saved yet — nothing changes for anybody until you press Save.
          </span>
        )}
        {saved && !changed && <span className="text-body-sm text-accent-green">Saved.</span>}
      </div>
    </>
  )
}

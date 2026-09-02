import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * The app's own dropdown.
 *
 * A native `<select>` takes its menu from the operating system, which is
 * the one part of a screen the app cannot style: on the teams page it
 * opened a white Windows list, in a white system font, over a dark card.
 * Everything around it had been dressed and the picker had not, so it read
 * as a piece of another program showing through.
 *
 * So the menu is ours. The trigger keeps the shape of a field, and the
 * list is a floating panel drawn in the app's own surfaces — rendered into
 * `document.body` so a card with `overflow-hidden` cannot clip it, and
 * positioned against the trigger's rect so it still follows the field when
 * the page scrolls underneath it.
 *
 * It is a listbox, not a div that looks like one: the trigger carries the
 * combobox role and the open state, the options carry their selection, and
 * the keyboard does what a select's keyboard does — arrows to move, Home
 * and End to jump, typing to find, Enter to choose, Escape to leave it as
 * it was.
 */

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectOptionGroup {
  /** The heading this run of options sits under, as an `optgroup` would. */
  label: string
  options: SelectOption[]
}

export type SelectItem = SelectOption | SelectOptionGroup

function isGroup(item: SelectItem): item is SelectOptionGroup {
  return (item as SelectOptionGroup).options !== undefined
}

/** Every option, groups flattened, in the order they are drawn. */
function flatten(items: SelectItem[]): SelectOption[] {
  return items.flatMap((item) => (isGroup(item) ? item.options : [item]))
}

interface Placement {
  left: number
  top: number
  width: number
  maxHeight: number
}

/** Where the menu goes: under the field, or above it when the window ends. */
function placementFor(trigger: HTMLElement): Placement {
  const rect = trigger.getBoundingClientRect()
  const gap = 6
  const margin = 12
  const below = window.innerHeight - rect.bottom - gap - margin
  const above = rect.top - gap - margin
  const openUp = below < 180 && above > below
  const maxHeight = Math.max(120, Math.min(288, openUp ? above : below))
  return {
    left: rect.left,
    width: rect.width,
    top: openUp ? rect.top - gap - maxHeight : rect.bottom + gap,
    maxHeight,
  }
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  id,
  name,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectItem[]
  /** Shown when `value` matches no option — an empty field, not a lie. */
  placeholder?: string
  disabled?: boolean
  /** Replaces the trigger's own classes, for the small inline pickers. */
  className?: string
  id?: string
  name?: string
  'aria-label'?: string
}) {
  const flat = useMemo(() => flatten(options), [options])
  const selected = flat.find((o) => o.value === value)

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = `${useId()}-listbox`

  const close = useCallback((refocus = true) => {
    setOpen(false)
    setPlacement(null)
    if (refocus) triggerRef.current?.focus()
  }, [])

  function openMenu() {
    if (disabled) return
    const trigger = triggerRef.current
    if (!trigger) return
    setPlacement(placementFor(trigger))
    // Opening lands on what is chosen, so the next arrow key moves from
    // there rather than from the top of a list you are already inside.
    setActive(Math.max(0, flat.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  // The field can move while the menu is open — a scroll under it, a
  // window resize, a phone rotating. Follow it rather than leaving the
  // menu behind, which reads as a piece of the page coming loose.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (triggerRef.current) setPlacement(placementFor(triggerRef.current))
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  // A click anywhere else is "never mind", including on the trigger —
  // which closes by its own click handler rather than reopening.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  // Keep the highlighted row in view when the arrows walk past the edge.
  useLayoutEffect(() => {
    if (!open) return
    const row = listRef.current?.querySelector('[data-active="true"]')
    // Guarded: jsdom has no scrollIntoView, and neither does an older
    // browser worth not crashing in.
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [open, active])

  function step(delta: number) {
    if (flat.length === 0) return
    let next = active
    for (let i = 0; i < flat.length; i += 1) {
      next = (next + delta + flat.length) % flat.length
      if (!flat[next].disabled) break
    }
    setActive(next)
  }

  function choose(index: number) {
    const option = flat[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close()
  }

  /** Typing jumps, the way a native select does: "wo" finds Worship. */
  function typeahead(key: string) {
    const now = Date.now()
    typed.current = {
      text: now - typed.current.at > 800 ? key : typed.current.text + key,
      at: now,
    }
    const query = typed.current.text.toLowerCase()
    const from = flat.findIndex(
      (o, i) => i > active && !o.disabled && o.label.toLowerCase().startsWith(query),
    )
    const found =
      from === -1
        ? flat.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(query))
        : from
    if (found !== -1) setActive(found)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'ArrowDown':
        e.preventDefault()
        step(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        step(-1)
        break
      case 'Home':
        e.preventDefault()
        setActive(flat.findIndex((o) => !o.disabled))
        break
      case 'End':
        e.preventDefault()
        setActive(flat.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Tab':
        close(false)
        break
      default:
        if (e.key.length === 1) typeahead(e.key)
    }
  }

  let index = -1

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        name={name}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`${className || triggerClasses} inline-flex items-center justify-between gap-2 text-left disabled:opacity-50`}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-on-surface-faint'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronGlyph open={open} />
      </button>

      {open &&
        placement &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{
              left: placement.left,
              top: placement.top,
              minWidth: placement.width,
              maxHeight: placement.maxHeight,
            }}
            className="fixed z-[60] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-surface-lowest p-1 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
          >
            {options.map((item) =>
              isGroup(item) ? (
                <div key={`group-${item.label}`} className="py-1">
                  <div className="px-3 py-1 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    {item.label}
                  </div>
                  {item.options.map((option) => {
                    index += 1
                    return renderOption(option, index)
                  })}
                </div>
              ) : (
                (() => {
                  index += 1
                  return renderOption(item, index)
                })()
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )

  function renderOption(option: SelectOption, at: number) {
    const isSelected = option.value === value
    return (
      <div
        key={option.value || `blank-${at}`}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        data-active={at === active}
        onMouseEnter={() => setActive(at)}
        onClick={() => choose(at)}
        className={`flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-chip)] px-3 py-2 text-body-sm transition-colors duration-150 ${
          option.disabled
            ? 'cursor-not-allowed text-on-surface-faint'
            : at === active
              ? 'bg-secondary-container text-on-surface'
              : 'text-on-surface-variant'
        }`}
      >
        <span className="min-w-0 truncate">{option.label}</span>
        {isSelected && (
          <span aria-hidden="true" className="shrink-0 text-secondary">
            ✓
          </span>
        )}
      </div>
    )
  }
}

/** The trigger, when the caller has no opinion: the shape of a field. */
export const triggerClasses =
  'w-full rounded-[var(--radius-chip)] border-0 bg-raised px-4 py-3 text-body-md text-on-surface hairline transition-shadow duration-300 ease-[var(--ease-glide)] focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'

/** The compact trigger, for a picker sitting inside a row of controls. */
export const selectPillClasses =
  'tap rounded-full bg-raised hairline px-3 py-1.5 text-body-sm text-on-surface transition-shadow duration-300 focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)] disabled:opacity-50'

function ChevronGlyph({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={14}
      height={14}
      className={`shrink-0 text-on-surface-faint transition-transform duration-300 ease-[var(--ease-glide)] ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

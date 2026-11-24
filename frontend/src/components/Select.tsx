import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { CheckIcon } from './icons'

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
 *
 * `search` is for the long ones: eighty people, a hundred things somebody
 * could be allowed to do. Typing to find already worked from a keyboard,
 * which a phone does not have until something asks for one — so on a
 * phone a long list was a long scroll. With `search`, the menu opens with
 * a box to type in and shows only what matches, by any part of the words
 * and not only their start. It is asked for and not automatic: a box that
 * raises the keyboard is in the way on a list of six.
 */

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /**
   * A few characters beside the option in the list — how many it holds,
   * say — and not in the field once it is chosen: the field says what was
   * picked, the list says what picking each would give.
   */
  hint?: string
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

/** A word as it is compared: case makes nothing different. */
const plain = (text: string) => text.trim().toLowerCase()

/**
 * The options a search finds: every word typed is somewhere in the option,
 * or in the name of the family it sits under — "services" brings the whole
 * of Services, and "see count" finds "See the Countdown".
 */
function matching(items: SelectItem[], query: string): SelectItem[] {
  const words = plain(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  const has = (text: string) => words.every((word) => plain(text).includes(word))
  return items.flatMap((item): SelectItem[] => {
    if (!isGroup(item)) return has(item.label) ? [item] : []
    const options = item.options.filter((option) => has(`${item.label} ${option.label}`))
    return options.length > 0 ? [{ ...item, options }] : []
  })
}

interface Placement {
  left: number
  /** One of the two: under the field it hangs from its top edge; above it,
      it stands on its bottom edge, so a short list sits against the field
      however tall it might have grown. */
  top?: number
  bottom?: number
  width: number
  /** What the menu may grow to, so a long option wraps instead of escaping. */
  maxWidth: number
  maxHeight: number
}

/**
 * Where the menu goes: under the field, or above it when the window ends —
 * and never past the side of the screen.
 *
 * The menu is as wide as its widest option, which on a phone is how "
 * Malayalam Service — Sunday, 6 September 2026" ran off the right-hand
 * edge with the end of it unreachable. So the width is capped to what is
 * actually there, and if the field sits far enough right that even a
 * capped menu would overflow, the menu slides back until it fits. A list
 * you cannot read the end of is a list that has not been drawn.
 */
function placementFor(trigger: HTMLElement, tallest = 288): Placement {
  const rect = trigger.getBoundingClientRect()
  const gap = 6
  const margin = 12
  // What can be seen, which with a phone's keyboard up is less than the
  // window: a menu with a search box in it must not open behind the keys.
  const view = window.visualViewport
  const viewTop = view?.offsetTop ?? 0
  const viewBottom = viewTop + (view?.height ?? window.innerHeight)
  const below = viewBottom - rect.bottom - gap - margin
  const above = rect.top - viewTop - gap - margin
  const openUp = below < 180 && above > below
  const maxHeight = Math.max(120, Math.min(tallest, openUp ? above : below))

  const room = window.innerWidth - margin * 2
  const width = Math.min(Math.max(rect.width, 0), room)
  // Pulled left only as far as it has to be, and never past the margin.
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width))

  return {
    left,
    width,
    maxWidth: room,
    // Opening upwards, measured from the bottom of the window: placed by
    // its top it was put where the tallest list would start, so "No · All"
    // hung a couple of hundred pixels above the field it belonged to.
    ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
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
  search = false,
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
  /** A box to type in at the top of the menu, for a list too long to scroll. */
  search?: boolean
  'aria-label'?: string
}) {
  const [query, setQuery] = useState('')
  // What the menu shows: everything, or with `search` what matches.
  const shown = useMemo(() => (search ? matching(options, query) : options), [search, options, query])
  const flat = useMemo(() => flatten(shown), [shown])
  const selected = useMemo(() => flatten(options).find((o) => o.value === value), [options, value])
  const searchRef = useRef<HTMLInputElement>(null)
  /** A menu with a box in it is allowed to be a little taller. */
  const tallest = search ? 340 : 288

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
    setQuery('')
    if (refocus) triggerRef.current?.focus()
  }, [])

  function openMenu() {
    if (disabled) return
    const trigger = triggerRef.current
    if (!trigger) return
    setPlacement(placementFor(trigger, tallest))
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
      if (triggerRef.current) setPlacement(placementFor(triggerRef.current, tallest))
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    // A phone's keyboard coming up changes what can be seen and not the window.
    const view = window.visualViewport
    view?.addEventListener('resize', reposition)
    view?.addEventListener('scroll', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      view?.removeEventListener('resize', reposition)
      view?.removeEventListener('scroll', reposition)
    }
  }, [open, tallest])

  // The box is where typing goes, so it has the keyboard from the start.
  useEffect(() => {
    if (open && search) searchRef.current?.focus()
  }, [open, search])

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

  /** The keys of the search box: the ones that move and choose are the menu's, the rest are typing. */
  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
      onKeyDown(e)
    }
    // Everything else belongs to the box, and must not reach the menu's own typing-to-find.
    e.stopPropagation()
  }

  let index = -1
  // Drawn only while the menu is open: a shut field has no rows to make.
  const rows = !open
    ? null
    : shown.map((item, at) =>
      isGroup(item) ? (
        <div
          key={`group-${item.label}`}
          className={at === 0 ? 'pb-1' : 'mt-1.5 border-t border-border-subtle pb-1 pt-1.5'}
        >
          {/* The heading was the same faint grey as the options it
              was heading, in a list where both are short lines of
              text — so it read as another option rather than as the
              name of a family. It is brighter now, and carries a
              rule out to the edge of the menu, which is a shape no
              option has. */}
          <div className="flex items-center gap-2 px-3 py-1">
            <span className="shrink-0 font-mono text-label-sm font-semibold text-on-surface-variant">
              {item.label}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-border-subtle" />
          </div>
          {item.options.map((option) => {
            index += 1
            return renderOption(option, index, true)
          })}
        </div>
      ) : (
        (() => {
          index += 1
          return renderOption(item, index)
        })()
      ),
    )
  const openUp = placement?.bottom !== undefined
  const floating =
    'fixed z-[60] rounded-[var(--radius-card)] bg-surface-lowest p-1 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12'

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
        <span className={`min-w-0 truncate ${selected ? '' : 'text-on-surface-variant'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronGlyph open={open} />
      </button>

      {open &&
        placement &&
        createPortal(
          search ? (
            // The box stays against the field: under it when the menu hangs
            // below, and at the bottom when the menu stands above, so what
            // is being typed does not move as the matches come and go.
            <div
              ref={listRef}
              style={{
                left: placement.left,
                top: placement.top,
                bottom: placement.bottom,
                minWidth: placement.width,
                maxWidth: placement.maxWidth,
                maxHeight: placement.maxHeight,
              }}
              className={`${floating} flex overflow-hidden ${openUp ? 'flex-col-reverse' : 'flex-col'}`}
            >
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  // The first thing it could mean, ready for Enter.
                  setActive(0)
                }}
                onKeyDown={onSearchKeyDown}
                placeholder="Type to find…"
                aria-label={ariaLabel ? `Search ${ariaLabel}` : 'Search'}
                aria-controls={listId}
                autoComplete="off"
                enterKeyHint="done"
                className="w-full shrink-0 rounded-[var(--radius-chip)] border-0 bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
              />
              <div
                role="listbox"
                id={listId}
                aria-label={ariaLabel}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${openUp ? 'mb-1' : 'mt-1'}`}
              >
                {rows}
                {flat.length === 0 && (
                  <p className="px-3 py-3 text-body-sm text-on-surface-variant">Nothing matches “{query.trim()}”.</p>
                )}
              </div>
            </div>
          ) : (
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
                bottom: placement.bottom,
                minWidth: placement.width,
                maxWidth: placement.maxWidth,
                maxHeight: placement.maxHeight,
              }}
              className={`${floating} overflow-y-auto overscroll-contain`}
            >
              {rows}
            </div>
          ),
          document.body,
        )}
    </>
  )

  /** `grouped` indents the row, so a family is visible in the shape of the
      list and not only in the words above it. */
  function renderOption(option: SelectOption, at: number, grouped = false) {
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
        className={`flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-chip)] py-2 pr-3 text-body-sm transition-colors duration-150 ${
          grouped ? 'pl-5' : 'pl-3'
        } ${
          option.disabled
            ? 'cursor-not-allowed text-on-surface-faint opacity-50'
            : at === active
              ? 'bg-secondary-container text-on-surface'
              : 'text-on-surface-variant'
        }`}
      >
        <span className="min-w-0 break-words">{option.label}</span>
        {(option.hint || isSelected) && (
          <span className="flex shrink-0 items-center gap-2">
            {option.hint && <span className="font-mono text-label-sm tabular text-on-surface-faint">{option.hint}</span>}
            {/* A place kept for the tick in a list that has hints, so the numbers stay in one column whichever is chosen. */}
            {(isSelected || option.hint) && (
              <span aria-hidden="true" className={`flex w-3.5 text-accent-blue-soft ${isSelected ? '' : 'invisible'}`}>
                <CheckIcon width={14} height={14} />
              </span>
            )}
          </span>
        )}
      </div>
    )
  }
}

/** The trigger, when the caller has no opinion: the shape of a field. */
export const triggerClasses =
  'w-full rounded-[var(--radius-chip)] border-0 bg-raised px-4 py-3 text-body-md text-on-surface hairline transition-shadow duration-200 ease-[var(--ease-glide)] focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'

/** The compact pill a permission grid's cell is drawn as: many to a row. */
export const reachPickerClasses =
  'tap cursor-pointer rounded-full bg-raised py-1 pl-2.5 pr-2 text-label-md text-on-surface hairline transition-shadow duration-200 hover:bg-raised-strong focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'

/** The compact trigger, for a picker sitting inside a row of controls. */
export const selectPillClasses =
  'tap rounded-full bg-raised hairline px-3 py-1.5 text-body-sm text-on-surface transition-shadow duration-200 focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)] disabled:opacity-50'

/**
 * The compact trigger when what it holds is narrowing a list: the same
 * pill, tinted, so a filter that is on is seen without reading it.
 */
export const selectPillOnClasses =
  'tap rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_18%,transparent)] px-3 py-1.5 text-body-sm font-medium text-accent-blue-soft transition-shadow duration-200 focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)] disabled:opacity-50'

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

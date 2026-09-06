import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { DotsVerticalIcon } from './icons'

/**
 * Everything you can do to one thing, behind one button.
 *
 * A session in the running order had grown seven controls — started, not
 * started, add time, skip, add a session below, remove, and a duration
 * ruler — and every card wore all seven at rest. On a phone that is four
 * rows of pills above the two facts anybody opened the page for: what the
 * session is, and who is doing it. The controls were not wrong; they were
 * simply always shouting, and the name and the lead were the quietest
 * things on the card.
 *
 * So the card shows the two facts, and the rest lives here. It is a menu,
 * not a div that looks like one: the trigger carries `aria-haspopup` and
 * its open state, the items are `menuitem`s, and the keyboard does what a
 * menu's keyboard does — arrows to move, Home and End to jump, Enter to
 * choose, Escape to leave it alone.
 *
 * Drawn into `document.body`, like Select, because a card that clips its
 * overflow would otherwise cut the menu in half.
 */

export interface MenuAction {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** `danger` for the one that takes something away. */
  tone?: 'plain' | 'danger' | 'accent'
  /** A word under the label, for an action whose effect is not obvious. */
  hint?: ReactNode
  /** Shown at the end of the row: a state this action already carries. */
  badge?: ReactNode
}

interface Placement {
  left: number
  top: number
  minWidth: number
  maxHeight: number
}

/** Under the button and aligned to its right edge — or above, at the foot
 *  of the window, and never past either side of the screen. */
function placementFor(trigger: HTMLElement, width: number): Placement {
  const rect = trigger.getBoundingClientRect()
  const gap = 6
  const margin = 12
  const below = window.innerHeight - rect.bottom - gap - margin
  const above = rect.top - gap - margin
  const openUp = below < 220 && above > below
  const maxHeight = Math.max(140, Math.min(360, openUp ? above : below))

  const room = window.innerWidth - margin * 2
  const menuWidth = Math.min(width, room)
  const right = rect.right
  const left = Math.max(margin, Math.min(right - menuWidth, window.innerWidth - margin - menuWidth))

  return {
    left,
    top: openUp ? rect.top - gap - maxHeight : rect.bottom + gap,
    minWidth: menuWidth,
    maxHeight,
  }
}

const TONES: Record<NonNullable<MenuAction['tone']>, string> = {
  plain: 'text-on-surface',
  danger: 'text-error',
  accent: 'text-accent-green',
}

export function ActionMenu({
  actions,
  label,
  className = '',
}: {
  actions: MenuAction[]
  /** What this menu is for: "Worship 1", so the button reads as its own. */
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuId = `${useId()}-menu`

  const usable = actions.filter((a) => !a.disabled)

  const close = useCallback((refocus = true) => {
    setOpen(false)
    setPlacement(null)
    if (refocus) triggerRef.current?.focus()
  }, [])

  function openMenu() {
    const trigger = triggerRef.current
    if (!trigger || actions.length === 0) return
    setPlacement(placementFor(trigger, 232))
    setActive(actions.findIndex((a) => !a.disabled))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (triggerRef.current) setPlacement(placementFor(triggerRef.current, 232))
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

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

  useLayoutEffect(() => {
    if (!open) return
    const row = listRef.current?.querySelector('[data-active="true"]')
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [open, active])

  function step(delta: number) {
    if (usable.length === 0) return
    let next = active
    for (let i = 0; i < actions.length; i += 1) {
      next = (next + delta + actions.length) % actions.length
      if (!actions[next].disabled) break
    }
    setActive(next)
  }

  function choose(index: number) {
    const action = actions[index]
    if (!action || action.disabled) return
    close()
    action.onSelect()
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
        setActive(actions.findIndex((a) => !a.disabled))
        break
      case 'End':
        e.preventDefault()
        setActive(actions.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Tab':
        close(false)
        break
    }
  }

  if (actions.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Actions for ${label}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised-strong hover:text-on-surface ${
          open ? 'bg-raised-strong text-on-surface' : ''
        } ${className}`}
      >
        <DotsVerticalIcon width={18} height={18} />
      </button>

      {open &&
        placement &&
        createPortal(
          <div
            ref={listRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${label}`}
            onKeyDown={onKeyDown}
            tabIndex={-1}
            style={{
              left: placement.left,
              top: placement.top,
              minWidth: placement.minWidth,
              maxHeight: placement.maxHeight,
            }}
            className="fixed z-50 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-surface-lowest p-1.5 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
          >
            {actions.map((action, i) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                data-active={i === active}
                onMouseEnter={() => !action.disabled && setActive(i)}
                onClick={() => choose(i)}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-chip)] px-3 py-2.5 text-left text-body-sm transition-colors duration-200 disabled:opacity-40 ${
                  TONES[action.tone ?? 'plain']
                } ${i === active && !action.disabled ? 'bg-raised' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{action.label}</span>
                  {action.hint && (
                    <span className="mt-0.5 block text-label-sm text-on-surface-faint">
                      {action.hint}
                    </span>
                  )}
                </span>
                {action.badge}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

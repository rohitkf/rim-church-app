import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { DockItem } from './DockNav'
import { groupItems } from '../lib/navGroups'

/**
 * Hold More, slide, let go.
 *
 * A tap on More opens the sheet, as it always has. Held for a moment
 * instead, the whole menu rises over the page — the page still there,
 * dimmed and blurred behind it — and the row under the finger lights up.
 * Slide up or down and the light follows; lift, and you are there. The
 * same gesture as a photo editor's list of adjustments: one press, one
 * slide, one release, and the thumb never leaves the glass.
 *
 * The rows are sized to the screen so the whole menu fits without
 * scrolling — a list you cannot scroll mid-gesture cannot be taller than
 * the phone. The light is one bar that glides from row to row rather than
 * a background each row switches on, which is what makes it read as
 * following the finger instead of flickering after it.
 *
 * Lifting where it started — on More itself, having not moved — lands on
 * the page you are already on, which is to say nothing happens. A gesture
 * cut short by the browser (a call coming in, the screen locking) closes
 * without going anywhere.
 */

/** How long a press is held before it becomes the quick menu. */
export const HOLD_MS = 320
/** A finger that moves this far before then is scrolling, not holding. */
const SLOP_PX = 10

type Item = DockItem & { group?: string }

export function QuickNavButton({
  items,
  onTap,
  expanded,
  className,
  children,
}: {
  items: Item[]
  /** An ordinary tap: open the sheet. */
  onTap: () => void
  expanded: boolean
  className: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const openRef = useRef(false)
  const activeRef = useRef<string | null>(null)
  const swallowClick = useRef(false)

  openRef.current = open
  activeRef.current = active

  const here =
    items.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)))?.to ??
    null

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  /** The row nearest the finger: the one it is over, else the closest end. */
  const rowAt = (y: number): string | null => {
    let best: string | null = null
    let distance = Infinity
    for (const [to, el] of rows.current) {
      const r = el.getBoundingClientRect()
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      if (d < distance) {
        distance = d
        best = to
      }
    }
    return best
  }

  const pick = (to: string | null) => {
    if (to && to !== activeRef.current) {
      // A tick under the thumb for each row passed, where the phone has one.
      navigator.vibrate?.(5)
      setActive(to)
    }
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (openRef.current) {
        e.preventDefault()
        pick(rowAt(e.clientY))
      } else if (start.current) {
        const dx = e.clientX - start.current.x
        const dy = e.clientY - start.current.y
        if (Math.hypot(dx, dy) > SLOP_PX) {
          clearTimer()
          start.current = null
        }
      }
    }
    const onUp = () => {
      clearTimer()
      start.current = null
      if (!openRef.current) return
      const to = activeRef.current
      setOpen(false)
      // The click that follows this release would otherwise open the sheet.
      swallowClick.current = true
      if (to && to !== location.pathname) navigate(to)
    }
    const onCancel = () => {
      clearTimer()
      start.current = null
      if (openRef.current) {
        setOpen(false)
        swallowClick.current = true
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    // rowAt and pick read refs; navigate and location are what can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, location.pathname])

  useEffect(() => clearTimer, [])

  return (
    <>
      <button
        type="button"
        aria-label="More"
        aria-expanded={expanded}
        aria-description="Tap for every page. Hold and slide to jump to one."
        className={className}
        // A long press is ours, not the browser's: no callout, no text
        // selection, and no scroll starting from under the thumb.
        style={{ WebkitTouchCallout: 'none', userSelect: 'none', touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          start.current = { x: e.clientX, y: e.clientY }
          clearTimer()
          timer.current = window.setTimeout(() => {
            timer.current = null
            setActive(here)
            setOpen(true)
            navigator.vibrate?.(10)
          }, HOLD_MS)
        }}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          onTap()
        }}
      >
        {children}
      </button>
      {open && createPortal(<QuickNavOverlay items={items} active={active} rows={rows} />, document.body)}
    </>
  )
}

function QuickNavOverlay({
  items,
  active,
  rows,
}: {
  items: Item[]
  active: string | null
  rows: React.MutableRefObject<Map<string, HTMLElement>>
}) {
  const runs = groupItems(items)
  const headings = runs.filter((r) => r.group).length
  // Sized so every row fits between the top of the screen and the dock.
  const room = (typeof window === 'undefined' ? 800 : window.innerHeight) - 190
  const rowH = Math.max(30, Math.min(46, Math.floor(room / (items.length + headings * 0.6))))

  const listRef = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = active ? rows.current.get(active) : null
    const list = listRef.current
    if (!el || !list) return setBar(null)
    const a = el.getBoundingClientRect()
    const b = list.getBoundingClientRect()
    setBar({ top: a.top - b.top, height: a.height })
  }, [active, rows, rowH])

  let index = 0
  return (
    <div
      role="listbox"
      aria-label="Quick navigation"
      aria-activedescendant={active ? `quicknav-${active}` : undefined}
      className="quicknav-in fixed inset-0 z-[60] flex select-none flex-col justify-end bg-black/60 pb-[calc(6.5rem+env(safe-area-inset-bottom))] backdrop-blur-[3px]"
      style={{ touchAction: 'none' }}
    >
      <div ref={listRef} className="quicknav-rise relative">
        {/* The light: one bar, gliding to whichever row is under the finger. */}
        {bar && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bg-primary transition-[transform,height] duration-150 ease-[var(--ease-glide)] motion-reduce:transition-none"
            style={{ transform: `translateY(${bar.top}px)`, height: bar.height, top: 0 }}
          />
        )}
        {runs.map((run) => (
          <div key={run.group ?? 'top'}>
            {run.group && (
              <div
                className="relative px-8 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45"
                style={{ height: Math.round(rowH * 0.6), lineHeight: `${Math.round(rowH * 0.6)}px` }}
              >
                {run.group}
              </div>
            )}
            {run.items.map((item) => {
              const on = item.to === active
              const delay = Math.min(index++ * 12, 180)
              return (
                <div
                  key={item.to}
                  id={`quicknav-${item.to}`}
                  role="option"
                  aria-selected={on}
                  ref={(el) => {
                    if (el) rows.current.set(item.to, el)
                    else rows.current.delete(item.to)
                  }}
                  className={`quicknav-row relative flex items-center px-8 font-mono text-[17px] tracking-[0.01em] transition-colors duration-150 ${
                    on ? 'text-on-primary' : 'text-white'
                  }`}
                  style={{ height: rowH, animationDelay: `${delay}ms` }}
                >
                  {item.label}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

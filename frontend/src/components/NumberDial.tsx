import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { indexOf, isMajor, stepCount, valueAt, visibleTicks } from '../lib/numberDial'

const PX_PER_STEP = 16

/**
 * A number you set by sliding a ruler past a mark.
 *
 * A stepper input asks for a number in the abstract: you are given a box and
 * left to know what belongs in it. A ruler answers the question the box
 * cannot — where does this sit? A duration of 25 minutes is obviously short
 * with the 60 visible three inches to the right, and 90 is obviously long,
 * and neither fact survives being typed into a field.
 *
 * It also suits the hand it is used by: this app is worked on a phone, often
 * standing up, and a drag is a better gesture than a 12px spinner arrow.
 *
 * None of which is a reason to take typing away. Tap the number and it
 * becomes a field — the fastest way to enter 47 is still to type 47, and
 * dragging to 3000 would be absurd. The ruler is the default, not the only
 * door.
 */
export function NumberDial({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  label,
  majorEvery = 5,
  disabled = false,
  className = '',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  /** "min", "days", "£" — shown small beside the number. */
  unit?: string
  /** Read out to a screen reader, which has no ruler to look at. */
  label: string
  /** A number under every nth tick. */
  majorEvery?: number
  disabled?: boolean
  className?: string
}) {
  const count = stepCount(min, max, step)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(280)
  const [dragging, setDragging] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')

  // Where the ruler is, in steps. It only differs from the value mid-drag,
  // which is what lets the ticks slide smoothly while the number stays whole.
  const [position, setPosition] = useState(() => indexOf(value, min, step))
  const positionRef = useRef(position)
  positionRef.current = position
  const grab = useRef({ x: 0, from: 0 })

  useEffect(() => {
    if (!dragging) setPosition(indexOf(value, min, step))
  }, [value, min, step, dragging])

  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    // ResizeObserver catches the ruler changing width without the window
    // doing so — a sheet opening, a column reflowing. Where it doesn't exist
    // (older browsers, jsdom) a window resize is close enough.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const commit = useCallback(
    (index: number) => {
      const next = valueAt(index, min, max, step)
      if (next !== value) onChange(next)
    },
    [min, max, step, value, onChange],
  )

  // Move and release are watched on the window: a finger that leaves the
  // ruler mid-drag is still dragging, and letting go outside it should still
  // let go.
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      e.preventDefault()
      const next = Math.min(Math.max(grab.current.from - (e.clientX - grab.current.x) / PX_PER_STEP, 0), count)
      setPosition(next)
      commit(next)
    }
    const end = () => {
      setDragging(false)
      // Snap: a ruler resting between two marks is a ruler that has not
      // answered the question.
      setPosition(Math.round(positionRef.current))
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging, count, commit])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    grab.current = { x: e.clientX, from: positionRef.current }
    setDragging(true)
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const jump = e.shiftKey ? (majorEvery || 5) : 1
    const moves: Record<string, number> = {
      ArrowLeft: -jump,
      ArrowDown: -jump,
      ArrowRight: jump,
      ArrowUp: jump,
      PageDown: -(majorEvery || 5) * 2,
      PageUp: (majorEvery || 5) * 2,
    }
    if (e.key === 'Home') {
      e.preventDefault()
      onChange(min)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      onChange(max)
      return
    }
    const delta = moves[e.key]
    if (delta === undefined) return
    e.preventDefault()
    commit(indexOf(value, min, step) + delta)
  }

  function acceptTyped() {
    const typed = Number(draft)
    setTyping(false)
    if (draft.trim() === '' || Number.isNaN(typed)) return
    commit(indexOf(typed, min, step))
  }

  const { from, to } = visibleTicks(position, width, PX_PER_STEP, count)
  const ticks: number[] = []
  for (let i = from; i <= to; i++) ticks.push(i)
  const offset = width / 2 - position * PX_PER_STEP

  return (
    <div className={`select-none ${className}`}>
      <div className="flex items-baseline justify-center gap-1.5">
        {typing ? (
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={acceptTyped}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); acceptTyped() }
              if (e.key === 'Escape') setTyping(false)
            }}
            aria-label={label}
            className="w-28 rounded-[var(--radius-chip)] bg-raised px-2 py-1 text-center font-mono text-headline-md text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary"
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => { setDraft(String(value)); setTyping(true) }}
            title="Type a value"
            className="font-mono text-headline-lg leading-none tabular text-primary disabled:opacity-50"
          >
            {value}
          </button>
        )}
        {unit && !typing && (
          <span className="font-mono text-label-md text-on-surface-variant">{unit}</span>
        )}
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={`relative mt-1.5 h-14 overflow-hidden rounded-[var(--radius-chip)] bg-raised hairline focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${
          disabled ? 'opacity-50' : dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        // Without this the browser claims the gesture as a page scroll and
        // the ruler never moves on a phone.
        style={{ touchAction: 'none' }}
      >
        {/* The ticks. Only the ones on screen exist: a range of ten thousand
            minutes drawn whole is a browser asked to lay out ten thousand
            elements for a form field. */}
        <div
          className="absolute inset-y-0 left-0 will-change-transform"
          style={{
            transform: `translateX(${offset}px)`,
            transition: dragging ? 'none' : 'transform 220ms var(--ease-glide)',
          }}
        >
          {ticks.map((i) => {
            const major = isMajor(i, majorEvery)
            const tickValue = valueAt(i, min, max, step)
            return (
              <div
                key={i}
                className="absolute top-0 flex h-full flex-col items-center"
                style={{ left: i * PX_PER_STEP, transform: 'translateX(-50%)' }}
              >
                <span
                  className={`mt-2 w-px ${
                    major ? 'h-3.5 bg-on-surface-variant' : 'h-2 bg-on-surface-faint/60'
                  }`}
                />
                {major && (
                  <span
                    className={`mt-1 font-mono text-label-sm tabular ${
                      tickValue === value ? 'text-primary' : 'text-on-surface-faint'
                    }`}
                  >
                    {tickValue}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* The mark everything is read against. Above the ticks, and the one
            thing on the strip that does not move. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1.5 h-6 w-0.5 -translate-x-1/2 rounded-full bg-primary"
        />
        {/* Both ends fade rather than stopping at a hard edge, so the ruler
            reads as continuing past the card instead of being cut off. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-raised to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-raised to-transparent"
        />
      </div>
    </div>
  )
}

/**
 * The same ruler, for a number that lives in a crowded row.
 *
 * A session's length sits in a timeline beside its name, its lead and three
 * buttons; a template's sits in a list of eight. Giving each of those a
 * full-width ruler would push everything else off the row and make a list of
 * eight sessions four screens long. So the row keeps a chip showing the
 * value, and the ruler opens over it when somebody actually wants to change
 * the number — which is rarely, and never while reading.
 */
export function NumberDialField({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  label,
  majorEvery = 5,
  disabled = false,
  className = '',
}: Parameters<typeof NumberDial>[0]) {
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement | null>(null)
  const popover = useRef<HTMLDivElement | null>(null)
  // How far the popover has been nudged sideways to stay on screen. A ruler
  // centred under a chip near the edge of a phone hangs off it otherwise,
  // and half a ruler is worse than an off-centre one.
  const shiftRef = useRef(0)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    if (!open) {
      shiftRef.current = 0
      setShift(0)
      return
    }
    const el = popover.current
    if (!el) return
    const fit = () => {
      const margin = 8
      const rect = el.getBoundingClientRect()
      const left = rect.left - shiftRef.current
      const right = rect.right - shiftRef.current
      let next = 0
      if (right > window.innerWidth - margin) next = window.innerWidth - margin - right
      if (left + next < margin) next = margin - left
      shiftRef.current = next
      setShift(next)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])

  // A picker that stays open after you have looked away is a picker that has
  // to be dismissed, which is one more thing to do than closing itself.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent | TouchEvent) => {
      if (holder.current && !holder.current.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div ref={holder} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="tap rounded-full bg-raised px-3 py-1 text-center font-mono text-label-md tabular text-on-surface hairline hover:border-secondary disabled:opacity-50"
      >
        {value}
        {unit ? <span className="ml-1 text-on-surface-faint">{unit}</span> : null}
      </button>

      {open && (
        <div
          ref={popover}
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="absolute left-1/2 top-full z-30 mt-2 w-[min(20rem,calc(100vw-1rem))] rounded-[var(--radius-card)] bg-surface-lowest p-3 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
        >
          <NumberDial
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            unit={unit}
            label={label}
            majorEvery={majorEvery}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full rounded-full bg-primary px-3 py-1.5 text-label-md font-medium text-on-primary"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}

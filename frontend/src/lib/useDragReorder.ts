import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { moveItem, sameOrder } from './reorder'

/**
 * Dragging rows up and down a list, with a finger or a mouse.
 *
 * Pointer events rather than HTML5 drag-and-drop, because HTML5 drag does
 * not exist on a phone — and a running order is reordered standing at the
 * back of a room, on a phone, minutes before the doors open.
 *
 * The list reorders live as you pass a neighbour: the row you are holding
 * follows the pointer and the rest slide around it, so what you see while
 * dragging is what you get when you let go. Nothing is written until then,
 * and a drag that ends where it began writes nothing at all.
 *
 * Move and release are listened for on the window, not on the grip. The
 * grip is inside the row, and the row is moved through the DOM the instant
 * the order changes — which drops pointer capture, and with it every
 * further event. Bound to the window, a drag survives its own effect.
 *
 * The handle is also a button: focus it and Arrow Up / Arrow Down move the
 * row a place at a time. A list you can only reorder by dragging is a list
 * some people cannot reorder.
 *
 * The rows that get out of the way slide, rather than appearing in their
 * new place. They cannot simply be given a CSS transition: they move
 * because the list reorders in the DOM, and a transition animates a
 * property changing, not a row changing position in its parent. So each
 * one is measured before and after the swap, put back where it was with a
 * transform, and released on the next frame — which the browser animates,
 * because that is a property changing. The list ends up where it already
 * was going; it just takes a quarter of a second to arrive.
 */

/** How long a displaced row takes to slide into its new place. */
const SLIDE_MS = 260
/** The lift and the set-down. Shorter, because it is only a shadow. */
const LIFT_MS = 200
export function useDragReorder(
  ids: string[],
  onCommit: (next: string[]) => void,
  { enabled = true }: { enabled?: boolean } = {},
) {
  // What the list looks like right now, which during a drag is ahead of
  // what the server has been told.
  const [preview, setPreview] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [shift, setShift] = useState(0)

  // The row that has just been let go, still wearing its shadow while it
  // fades. Without it a drag ends by the row going flat in one frame,
  // which reads as the app dropping it rather than the person setting it
  // down.
  const [landing, setLanding] = useState<string | null>(null)

  const rows = useRef(new Map<string, HTMLElement>())
  const grabOffset = useRef(0)
  const shiftRef = useRef(0)
  const orderRef = useRef<string[]>(ids)
  const idsRef = useRef<string[]>(ids)
  const commitRef = useRef(onCommit)

  const ordered = preview ?? ids
  orderRef.current = ordered
  idsRef.current = ids
  commitRef.current = onCommit

  // A refetch mid-drag would otherwise leave the preview describing a list
  // that no longer exists.
  useEffect(() => {
    if (!dragId) setPreview(null)
  }, [ids, dragId])

  /*
   * One ref callback per row, kept for the life of the list.
   *
   * A fresh closure each render would be a fresh ref to React, which
   * detaches and reattaches every row the moment the order changes — and
   * the row being dragged can come out of the map on the way through,
   * which ends the drag one swap in.
   */
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const refFor = useCallback((id: string) => {
    const held = refs.current.get(id)
    if (held) return held
    const ref = (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el)
      else rows.current.delete(id)
    }
    refs.current.set(id, ref)
    return ref
  }, [])

  /*
   * The slide.
   *
   * Runs after the DOM has been reordered, so `lastTops` still holds where
   * every row was a moment ago: the difference is exactly how far each one
   * has to be put back before being let go again. Only during a drag —
   * a list arriving from the server should appear in its order, not
   * animate its way into it.
   */
  const lastTops = useRef(new Map<string, number>())
  const wasDragging = useRef(false)
  const orderKey = ordered.join('|')

  useLayoutEffect(() => {
    if (!dragId) {
      // Nothing to measure against once the drag is over, and leaving the
      // transition behind would animate the next thing that moves this row
      // for an unrelated reason.
      for (const [id, el] of rows.current) {
        // Every row but the one being set down. Clearing that one too wiped
        // off the transition React had just given it, in the same batch,
        // and the lift came off in a single frame after all.
        if (id === landing) continue
        el.style.transition = ''
        el.style.transform = ''
      }
      lastTops.current.clear()
      wasDragging.current = false
      return
    }

    const tops = new Map<string, number>()
    for (const [id, el] of rows.current) tops.set(id, el.getBoundingClientRect().top)

    // The first pass of a drag has nothing to compare against: it is the
    // measurement everything after it is compared to.
    if (wasDragging.current) {
      for (const [id, el] of rows.current) {
        if (id === dragId) continue
        const before = lastTops.current.get(id)
        const now = tops.get(id)
        if (before === undefined || now === undefined || Math.abs(before - now) < 1) continue
        el.style.transition = 'none'
        el.style.transform = `translateY(${before - now}px)`
        // Next frame, or the browser coalesces both values into one paint
        // and there is nothing to animate between.
        requestAnimationFrame(() => {
          el.style.transition = `transform ${SLIDE_MS}ms var(--ease-glide)`
          el.style.transform = ''
        })
      }
    }

    lastTops.current = tops
    wasDragging.current = true
  }, [dragId, orderKey, landing])

  useEffect(() => {
    if (!dragId) return

    const move = (e: PointerEvent) => {
      const el = rows.current.get(dragId)
      if (!el) return
      e.preventDefault()

      const rect = el.getBoundingClientRect()
      // Where the row sits with the drag offset taken back out, so the
      // sums stay right after the list has reordered underneath it.
      const restingTop = rect.top - shiftRef.current
      const wantedTop = e.clientY - grabOffset.current
      shiftRef.current = wantedTop - restingTop
      setShift(shiftRef.current)

      const order = orderRef.current
      const index = order.indexOf(dragId)
      const rectOf = (offset: number) => {
        const neighbour = rows.current.get(order[index + offset])
        return neighbour ? restingRect(neighbour) : undefined
      }

      // Past the midpoint of the row above or below is the moment the two
      // swap — the rule a hand already uses, and it needs no drop zones.
      const above = index > 0 ? rectOf(-1) : undefined
      const below = index < order.length - 1 ? rectOf(1) : undefined
      if (above && wantedTop < above.top + above.height / 2) {
        setPreview(moveItem(order, index, index - 1))
      } else if (below && wantedTop + rect.height > below.top + below.height / 2) {
        setPreview(moveItem(order, index, index + 1))
      }
    }

    const end = () => {
      const next = orderRef.current
      setDragId(null)
      setShift(0)
      shiftRef.current = 0
      // The row goes back into the list immediately — animating it there
      // would be animating towards a position that the commit is about to
      // change — but the lift comes off gently.
      setLanding(dragId)
      if (!sameOrder(next, idsRef.current)) commitRef.current(next)
      setPreview(null)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragId])

  const onPointerDown = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0) return
      const el = rows.current.get(id)
      if (!el) return
      e.preventDefault()
      grabOffset.current = e.clientY - el.getBoundingClientRect().top
      shiftRef.current = 0
      setShift(0)
      setPreview(orderRef.current)
      setDragId(id)
    },
    [enabled],
  )

  const onKeyDown = useCallback(
    (id: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!enabled) return
      const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      if (step === 0) return
      e.preventDefault()
      const index = ids.indexOf(id)
      if (index < 0) return
      const next = moveItem(ids, index, index + step)
      if (!sameOrder(next, ids)) onCommit(next)
    },
    [enabled, ids, onCommit],
  )

  /** Everything a drag handle needs. Spread onto the grip, not the row. */
  const handleProps = useCallback(
    (id: string) => ({
      onPointerDown: onPointerDown(id),
      onKeyDown: onKeyDown(id),
      // Without this the browser claims the gesture as a scroll and the
      // row never moves on a phone.
      style: { touchAction: 'none' as const },
    }),
    [onPointerDown, onKeyDown],
  )

  useEffect(() => {
    if (!landing) return
    const timer = window.setTimeout(() => setLanding(null), LIFT_MS)
    return () => window.clearTimeout(timer)
  }, [landing])

  /** Everything a row needs: measured, lifted, and slid out of the way. */
  const rowProps = useCallback(
    (id: string) => {
      const dragging = dragId === id
      const style: CSSProperties = dragging
        ? {
            // `translate` rather than a transform, so the row can follow
            // the pointer with nothing smoothing it — a lag between a
            // finger and the thing it is holding is the one place easing
            // makes an interface feel worse — while the lift beside it
            // still eases in.
            translate: `0 ${shift}px`,
            scale: '1.015',
            zIndex: 20,
            position: 'relative',
            // A lifted row: nothing else on the page moves like this, so
            // there is never a question about which one is in hand.
            boxShadow: 'var(--shadow-lifted)',
            touchAction: 'none',
            transition: `scale ${LIFT_MS}ms var(--ease-glide), box-shadow ${LIFT_MS}ms var(--ease-glide)`,
          }
        : landing === id
          ? {
              zIndex: 20,
              position: 'relative',
              scale: '1',
              boxShadow: 'none',
              transition: `scale ${LIFT_MS}ms var(--ease-glide), box-shadow ${LIFT_MS}ms var(--ease-glide)`,
            }
          : {}
      return {
        ref: refFor(id),
        style,
        'data-dragging': dragging || undefined,
      }
    },
    [dragId, shift, landing, refFor],
  )

  return { ordered, dragId, handleProps, rowProps }
}

/**
 * Where a row is settling, rather than where it currently looks.
 *
 * A neighbour part-way through its slide is drawn somewhere between two
 * places, and asking it where it is gets the halfway answer. Deciding the
 * next swap on that answer is how a list ends up oscillating: the swap that
 * has just happened is still visible, so it reads as a reason to swap back.
 * Subtracting the transform still in flight gives the position the row is
 * heading for, which is the one the rule is actually about.
 */
function restingRect(el: HTMLElement): { top: number; height: number } {
  const rect = el.getBoundingClientRect()
  return { top: rect.top - translateYOf(el), height: rect.height }
}

/**
 * The vertical part of whatever transform is on an element right now,
 * mid-animation included. Read off the computed matrix rather than through
 * DOMMatrix, which older browsers and jsdom do not both have.
 *
 * Exported for its own test: every browser resolves a computed transform to
 * a matrix, but jsdom hands back whatever string was written, so this
 * cannot be exercised honestly through the DOM. Anything unparseable is
 * nought — the position we then read is the one on screen, which is the
 * behaviour this replaced and is never worse than not moving at all.
 */
export function translateYOf(el: HTMLElement): number {
  const transform = window.getComputedStyle(el).transform
  if (!transform || transform === 'none') return 0
  const values = transform.slice(transform.indexOf('(') + 1, -1).split(',')
  // matrix(a, b, c, d, e, f) — f is the vertical translation. A 3d matrix
  // has sixteen values and keeps it at index 13.
  const at = values.length === 16 ? 13 : 5
  const y = Number.parseFloat(values[at])
  return Number.isFinite(y) ? y : 0
}

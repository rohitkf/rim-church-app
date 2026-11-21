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
import { placeAmong, type Box } from './chipOrder'
import { moveItem, sameOrder } from './reorder'

/**
 * Dragging chips into a new order, with a finger or a mouse.
 *
 * The same promises as dragging rows (lib/useDragReorder), which this is
 * the wrapping cousin of: pointer events, because HTML5 drag does not
 * exist on a phone; a grip, the only place a drag starts, so it never
 * fights the scroll or the chip's own buttons; the order changing live as
 * you pass a neighbour, so what you see is what you get; nothing written
 * until you let go, and nothing at all if it ends where it began; and the
 * arrow keys on the grip, because a list you can only reorder by dragging
 * is a list some people cannot reorder.
 *
 * What is different is that chips wrap, so the one in hand moves both
 * ways and "passed a neighbour" is lib/chipOrder's question rather than a
 * line crossed.
 *
 * And the new order is kept on screen after letting go, until the caller
 * hands back a list that has changed. A chip that dropped into place,
 * sprang back, and then moved again when the save returned would look
 * like the app arguing.
 */

/** How long a displaced chip takes to slide into its new place. */
const SLIDE_MS = 220
/** How long a new order is believed before the caller has confirmed it. */
const HOLD_MS = 4000
/** Less than this since the last swap is a hand shaking, not a change of mind. */
const SETTLE_PX = 8

type Point = { x: number; y: number }

export function useChipReorder(ids: string[], onCommit: (next: string[]) => void) {
  // What the list looks like right now: ahead of the caller during a drag,
  // and for a moment after it.
  const [preview, setPreview] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [shift, setShift] = useState<Point>({ x: 0, y: 0 })

  const chips = useRef(new Map<string, HTMLElement>())
  const grab = useRef<Point>({ x: 0, y: 0 })
  const pointer = useRef<Point>({ x: 0, y: 0 })
  const shiftRef = useRef<Point>({ x: 0, y: 0 })
  const idsRef = useRef(ids)
  const commitRef = useRef(onCommit)
  // The order before the last swap, and where the pointer was at it: the
  // one swap that is refused is straight back, by a pointer that has not moved.
  const swapped = useRef<{ from: string; at: Point } | null>(null)
  // Whose grip had the keyboard when the order last changed by key.
  const refocus = useRef<string | null>(null)

  const idsKey = ids.join('|')
  // A preview naming somebody who is no longer here is describing another list.
  const usable = preview && preview.length === ids.length && preview.every((id) => ids.includes(id))
  const ordered = usable ? preview : ids
  const orderRef = useRef(ordered)
  const dragRef = useRef(dragId)
  const orderKey = ordered.join('|')
  // What the handlers below read. Brought up to date as each render lands,
  // and first, so the effects after this one read this render's too.
  useLayoutEffect(() => {
    orderRef.current = ordered
    idsRef.current = ids
    commitRef.current = onCommit
    dragRef.current = dragId
  })

  // The caller's list changed: it has caught up, or somebody else changed
  // it. Either way theirs is the order now. And a save that never comes
  // back must not leave a made-up order on screen for good.
  useEffect(() => {
    if (!dragRef.current) setPreview(null)
  }, [idsKey])
  useEffect(() => {
    if (dragId || !preview) return
    const timer = window.setTimeout(() => setPreview(null), HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [dragId, preview])

  // One ref callback per chip, kept for the life of the list: a fresh one
  // each render detaches and reattaches every chip as the order changes.
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const refFor = useCallback((id: string) => {
    const held = refs.current.get(id)
    if (held) return held
    const ref = (el: HTMLElement | null) => {
      if (el) chips.current.set(id, el)
      else chips.current.delete(id)
    }
    refs.current.set(id, ref)
    return ref
  }, [])

  /*
   * The slide, and keeping the chip in hand under the finger.
   *
   * Runs after the chips have been reordered in the page. Each of the
   * others is put back where it was a moment ago and let go, which the
   * browser animates. The one in hand has a new resting place too, so the
   * offset that held it under the pointer is now wrong by exactly the
   * distance its place moved: corrected here, before anything is painted.
   */
  const lastRest = useRef(new Map<string, Point>())
  useLayoutEffect(() => {
    if (!dragId) {
      for (const el of chips.current.values()) atRest(el)
      lastRest.current.clear()
      return
    }

    const rest = new Map<string, Point>()
    for (const [id, el] of chips.current) {
      if (id === dragId) continue
      // Wherever it has got to on the way to its last place, it sets off from there.
      const flight = flightOf(el)
      atRest(el, 'none')
      const rect = el.getBoundingClientRect()
      const now = { x: rect.left, y: rect.top }
      rest.set(id, now)
      const before = lastRest.current.get(id)
      if (!before) continue
      const dx = before.x + flight.x - now.x
      const dy = before.y + flight.y - now.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      slideFrom(el, dx, dy)
    }
    lastRest.current = rest

    const held = chips.current.get(dragId)
    if (held) {
      const rect = held.getBoundingClientRect()
      const next = {
        x: pointer.current.x - grab.current.x - (rect.left - shiftRef.current.x),
        y: pointer.current.y - grab.current.y - (rect.top - shiftRef.current.y),
      }
      if (Math.abs(next.x - shiftRef.current.x) >= 1 || Math.abs(next.y - shiftRef.current.y) >= 1) {
        shiftRef.current = next
        carry(held, next)
        setShift(next)
      }
    }
  }, [dragId, orderKey])

  useEffect(() => {
    if (!dragId) return

    const move = (e: PointerEvent) => {
      const el = chips.current.get(dragId)
      if (!el) return
      e.preventDefault()
      pointer.current = { x: e.clientX, y: e.clientY }

      const rect = el.getBoundingClientRect()
      // Where the chip rests with the drag offset taken back out.
      const resting = { x: rect.left - shiftRef.current.x, y: rect.top - shiftRef.current.y }
      const wanted = { x: e.clientX - grab.current.x, y: e.clientY - grab.current.y }
      shiftRef.current = { x: wanted.x - resting.x, y: wanted.y - resting.y }
      setShift(shiftRef.current)

      const order = orderRef.current
      const index = order.indexOf(dragId)
      const boxes: Box[] = order.map((id) => {
        if (id === dragId) return { left: resting.x, top: resting.y, width: rect.width, height: rect.height }
        const other = chips.current.get(id)
        if (!other) return { left: 0, top: 0, width: 0, height: 0 }
        // Where it is heading, not the halfway place its slide has reached.
        const box = other.getBoundingClientRect()
        const flight = flightOf(other)
        return { left: box.left - flight.x, top: box.top - flight.y, width: box.width, height: box.height }
      })
      const place = placeAmong({ x: wanted.x + rect.width / 2, y: wanted.y + rect.height / 2 }, boxes, index)
      if (place === index) return

      const next = moveItem(order, index, place)
      const last = swapped.current
      // Chips are different widths, so a swap moves the others, and the
      // new picture can ask for the swap back. A pointer that has not
      // moved has not asked for anything.
      if (
        last &&
        last.from === next.join('|') &&
        Math.hypot(e.clientX - last.at.x, e.clientY - last.at.y) < SETTLE_PX
      )
        return
      swapped.current = { from: order.join('|'), at: { x: e.clientX, y: e.clientY } }
      setPreview(next)
    }

    const end = () => {
      const next = orderRef.current
      setDragId(null)
      setShift({ x: 0, y: 0 })
      shiftRef.current = { x: 0, y: 0 }
      swapped.current = null
      if (sameOrder(next, idsRef.current)) {
        setPreview(null)
        return
      }
      // Kept on screen until the caller's list says the same, or does not.
      setPreview(next)
      commitRef.current(next)
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
      if (e.button !== 0) return
      const el = chips.current.get(id)
      if (!el) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      grab.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      pointer.current = { x: e.clientX, y: e.clientY }
      shiftRef.current = { x: 0, y: 0 }
      swapped.current = null
      setShift({ x: 0, y: 0 })
      setPreview(orderRef.current)
      setDragId(id)
    },
    [],
  )

  const onKeyDown = useCallback(
    (id: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
      // Either pair: the chips are a row on a wide screen and a column on a narrow one.
      const step =
        e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
      if (step === 0) return
      e.preventDefault()
      const order = orderRef.current
      const index = order.indexOf(id)
      if (index < 0) return
      const next = moveItem(order, index, index + step)
      if (sameOrder(next, order)) return
      refocus.current = id
      setPreview(next)
      commitRef.current(next)
    },
    [],
  )

  // Moving a chip through the page can take the keyboard off its grip,
  // which would make every press after the first do nothing.
  useEffect(() => {
    const id = refocus.current
    if (!id) return
    refocus.current = null
    chips.current.get(id)?.querySelector<HTMLElement>('[data-grip]')?.focus()
  }, [orderKey])

  /** Everything a grip needs. Spread onto the grip, not the chip. */
  const gripProps = useCallback(
    (id: string) => ({
      onPointerDown: onPointerDown(id),
      onKeyDown: onKeyDown(id),
      'data-grip': true,
      // Without this the browser claims the gesture as a scroll and the
      // chip never moves on a phone.
      style: { touchAction: 'none' as const },
    }),
    [onPointerDown, onKeyDown],
  )

  /** Everything a chip needs: measured, lifted, and slid out of the way. */
  const chipProps = useCallback(
    (id: string) => {
      const dragging = dragId === id
      const style: CSSProperties = dragging
        ? {
            // `translate`, with nothing smoothing it: a lag between a
            // finger and the thing it is holding is the one place easing
            // makes an interface feel worse.
            translate: `${shift.x}px ${shift.y}px`,
            zIndex: 40,
            position: 'relative',
            boxShadow: 'var(--shadow-lifted)',
            touchAction: 'none',
          }
        : {}
      return { ref: refFor(id), style, 'data-dragging': dragging || undefined }
    },
    [dragId, shift, refFor],
  )

  return { ordered, dragId, gripProps, chipProps }
}

/** No transform of ours on it: where the page puts it. */
function atRest(el: HTMLElement, transition = '') {
  el.style.transition = transition
  el.style.transform = ''
}

/** Put back `dx`, `dy` from its place, then let go: the browser animates the way home. */
function slideFrom(el: HTMLElement, dx: number, dy: number) {
  el.style.transform = `translate(${dx}px, ${dy}px)`
  // Next frame, or the browser folds both values into one paint and there
  // is nothing to animate between.
  requestAnimationFrame(() => {
    el.style.transition = `transform ${SLIDE_MS}ms var(--ease-glide)`
    el.style.transform = ''
  })
}

/** The chip in hand, moved without waiting for a render. */
function carry(el: HTMLElement, by: Point) {
  el.style.translate = `${by.x}px ${by.y}px`
}

/**
 * How far a chip is from its resting place right now, mid-slide included.
 * Read off the computed matrix: `matrix(a, b, c, d, x, y)`, or a 3d one
 * that keeps them at 12 and 13. Anything unreadable is nought, which is
 * the place on screen and never worse than not moving at all.
 */
export function flightOf(el: HTMLElement): Point {
  const transform = window.getComputedStyle(el).transform
  if (!transform || transform === 'none') return { x: 0, y: 0 }
  const values = transform.slice(transform.indexOf('(') + 1, -1).split(',')
  const at = values.length === 16 ? 12 : 4
  const x = Number.parseFloat(values[at])
  const y = Number.parseFloat(values[at + 1])
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

import {
  useCallback,
  useEffect,
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
 */
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
      const rectOf = (offset: number) =>
        rows.current.get(order[index + offset])?.getBoundingClientRect()

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

  /** Everything a row needs: measured, lifted, and slid out of the way. */
  const rowProps = useCallback(
    (id: string) => {
      const dragging = dragId === id
      const style: CSSProperties = dragging
        ? {
            transform: `translateY(${shift}px)`,
            zIndex: 20,
            position: 'relative',
            // A lifted row: nothing else on the page moves like this, so
            // there is never a question about which one is in hand.
            boxShadow: 'var(--shadow-lifted)',
            touchAction: 'none',
          }
        : dragId
          ? { transition: 'transform 160ms var(--ease-glide)' }
          : {}
      return {
        ref: refFor(id),
        style,
        'data-dragging': dragging || undefined,
      }
    },
    [dragId, shift, refFor],
  )

  return { ordered, dragId, handleProps, rowProps }
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampBlock,
  fitScale,
  inkOn,
  personName,
  snap,
  type StageBlock,
} from '../lib/stage'

/**
 * The stage, drawn, and the blocks on it, moved by hand.
 *
 * A picture of a stage is the point: a list of "keyboard, left" is what
 * the chat thread already was. So this is a canvas you pan and zoom
 * (pinch, wheel, the buttons), with blocks you drag where they go and
 * pull a corner to resize. On a phone it fills the screen's width and is
 * zoomed to fit on opening, so the whole stage is in view before anybody
 * touches it.
 *
 * Everything moves locally while a finger is down and is written once it
 * lifts — one row per gesture, not sixty a second — and the parent owns
 * the blocks, so a change somebody else makes arrives through the same
 * props as your own.
 *
 * Pointer events only, so a mouse, a finger and a pen are one code path;
 * `touch-action: none` keeps the browser from scrolling the page out from
 * under a drag.
 */

export interface Stage {
  width: number
  height: number
}

/** The part of a block the canvas can change. */
export type BlockBox = { x: number; y: number; w: number; h: number }

type Gesture =
  | { kind: 'pan'; pointer: number; startX: number; startY: number; tx: number; ty: number; moved: boolean }
  | { kind: 'drag'; pointer: number; id: string; grabX: number; grabY: number; moved: boolean }
  | { kind: 'resize'; pointer: number; id: string; startW: number; startH: number; startX: number; startY: number }
  | { kind: 'pinch'; a: number; b: number; startDist: number; startScale: number; midX: number; midY: number }

export function StageCanvas({
  stage,
  blocks,
  selectedId,
  onSelect,
  canEdit,
  onCommit,
  onDelete,
  className = '',
}: {
  stage: Stage
  blocks: StageBlock[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Whether blocks may be dragged and resized here at all. */
  canEdit: boolean
  /** A gesture has finished: this block is now here. */
  onCommit: (id: string, box: BlockBox) => void
  /** Delete pressed on the keyboard with a block selected. */
  onDelete?: (id: string) => void
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scale: 0.5, tx: 0, ty: 0 })
  const [live, setLive] = useState<{ id: string; box: BlockBox } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const fitted = useRef(false)

  const fit = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const scale = fitScale(stage, rect)
    setView({
      scale,
      tx: (rect.width - stage.width * scale) / 2,
      ty: (rect.height - stage.height * scale) / 2,
    })
  }, [stage])

  // Fit once the box has a size, and again if the window changes shape.
  useLayoutEffect(() => {
    if (!fitted.current) {
      fitted.current = true
      fit()
    }
    if (typeof ResizeObserver === 'undefined') return
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = boxRef.current?.getBoundingClientRect()
      const left = rect?.left ?? 0
      const top = rect?.top ?? 0
      return { x: (clientX - left - view.tx) / view.scale, y: (clientY - top - view.ty) / view.scale }
    },
    [view],
  )

  const zoomAt = useCallback((factor: number, atX?: number, atY?: number) => {
    setView((v) => {
      const rect = boxRef.current?.getBoundingClientRect()
      const cx = atX ?? (rect ? rect.width / 2 : 0)
      const cy = atY ?? (rect ? rect.height / 2 : 0)
      const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.scale * factor))
      const k = scale / v.scale
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
    })
  }, [])

  // The wheel: pinch-zoom on a trackpad arrives as ctrl+wheel; plain wheel
  // pans. Registered by hand because React's onWheel is passive and
  // cannot stop the page scrolling as well.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top)
      } else {
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const blockById = (id: string) => blocks.find((b) => b.id === id)

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = boxRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // A second finger turns whatever was happening into a pinch.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.entries()]
      const rect = el.getBoundingClientRect()
      gesture.current = {
        kind: 'pinch',
        a: a[0],
        b: b[0],
        startDist: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
        startScale: view.scale,
        midX: (a[1].x + b[1].x) / 2 - rect.left,
        midY: (a[1].y + b[1].y) / 2 - rect.top,
      }
      setLive(null)
      return
    }

    const target = e.target as HTMLElement
    const handle = target.closest<HTMLElement>('[data-handle]')
    const blockEl = target.closest<HTMLElement>('[data-block]')
    const world = toWorld(e.clientX, e.clientY)

    if (handle && canEdit) {
      const id = handle.dataset.handle!
      const b = blockById(id)
      if (!b) return
      gesture.current = { kind: 'resize', pointer: e.pointerId, id, startW: b.w, startH: b.h, startX: world.x, startY: world.y }
      onSelect(id)
      return
    }
    if (blockEl) {
      const id = blockEl.dataset.block!
      onSelect(id)
      const b = blockById(id)
      if (!b || !canEdit) return
      gesture.current = { kind: 'drag', pointer: e.pointerId, id, grabX: world.x - b.x, grabY: world.y - b.y, moved: false }
      return
    }
    gesture.current = { kind: 'pan', pointer: e.pointerId, startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty, moved: false }
  }

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      const a = pointers.current.get(g.a)
      const b = pointers.current.get(g.b)
      if (!a || !b) return
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (g.startScale * dist) / g.startDist))
      setView((v) => {
        const k = scale / v.scale
        return { scale, tx: g.midX - (g.midX - v.tx) * k, ty: g.midY - (g.midY - v.ty) * k }
      })
      return
    }
    if (g.pointer !== e.pointerId) return
    if (g.kind === 'pan') {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true
      setView((v) => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }))
      return
    }
    const world = toWorld(e.clientX, e.clientY)
    const b = blockById(g.id)
    if (!b) return
    if (g.kind === 'drag') {
      const next = clampBlock({ x: snap(world.x - g.grabX), y: snap(world.y - g.grabY), w: b.w, h: b.h }, stage)
      if (next.x !== b.x || next.y !== b.y) g.moved = true
      setLive({ id: g.id, box: next })
    } else {
      const next = clampBlock(
        { x: b.x, y: b.y, w: snap(g.startW + (world.x - g.startX)), h: snap(g.startH + (world.y - g.startY)) },
        stage,
      )
      setLive({ id: g.id, box: next })
    }
  }

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    boxRef.current?.releasePointerCapture(e.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = null
      return
    }
    if (g.pointer !== e.pointerId) return
    gesture.current = null
    if (g.kind === 'pan') {
      if (!g.moved) onSelect(null)
      return
    }
    if (live && live.id === g.id) {
      const b = blockById(g.id)
      if (b && (live.box.x !== b.x || live.box.y !== b.y || live.box.w !== b.w || live.box.h !== b.h)) {
        onCommit(g.id, live.box)
      }
    }
    setLive(null)
  }

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedId || !canEdit) return
    const b = blockById(selectedId)
    if (!b) return
    const step = e.shiftKey ? 50 : 10
    const nudge = (dx: number, dy: number) => {
      e.preventDefault()
      onCommit(b.id, clampBlock({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, stage))
    }
    if (e.key === 'ArrowLeft') nudge(-step, 0)
    else if (e.key === 'ArrowRight') nudge(step, 0)
    else if (e.key === 'ArrowUp') nudge(0, -step)
    else if (e.key === 'ArrowDown') nudge(0, step)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && onDelete) {
      e.preventDefault()
      onDelete(b.id)
    }
  }

  const percent = Math.round(view.scale * 100)

  return (
    <div className={`relative ${className}`}>
      <div
        ref={boxRef}
        role="application"
        aria-label="Stage"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={onKey}
        className="relative aspect-[12/7] max-h-[62svh] min-h-[280px] w-full touch-none select-none overflow-hidden rounded-[var(--radius-card)] bg-inset hairline focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
        style={{ cursor: gesture.current?.kind === 'pan' ? 'grabbing' : 'default' }}
      >
        <div
          data-stage
          className="absolute left-0 top-0 rounded-[18px] bg-surface-lowest shadow-[var(--shadow-lifted)] ring-1 ring-white/10"
          style={{
            width: stage.width,
            height: stage.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: '0 0',
            backgroundImage:
              'radial-gradient(circle, color-mix(in oklab, var(--color-on-surface) 14%, transparent) 1.2px, transparent 1.3px)',
            backgroundSize: '40px 40px',
            backgroundPosition: '20px 20px',
          }}
        >
          {/* The back wall, and the front where the congregation is. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-t-[18px] bg-raised-strong font-mono text-[13px] uppercase tracking-[0.18em] text-on-surface-faint"
          >
            Back of stage
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 flex h-9 items-center justify-center rounded-b-[18px] border-t-2 border-dashed border-primary/50 font-mono text-[13px] uppercase tracking-[0.18em] text-primary"
          >
            Front · congregation
          </div>

          {blocks.map((b) => {
            const box = live && live.id === b.id ? live.box : { x: b.x, y: b.y, w: b.w, h: b.h }
            const selected = b.id === selectedId
            const ink = inkOn(b.color)
            return (
              <div
                key={b.id}
                data-block={b.id}
                role="button"
                aria-label={b.person ? `${b.label}, ${personName(b.person)}` : b.label}
                aria-pressed={selected}
                className={`absolute flex flex-col items-center justify-center overflow-hidden rounded-[14px] px-2 text-center transition-shadow ${
                  selected ? 'shadow-[0_0_0_4px_var(--color-primary),0_12px_30px_rgba(0,0,0,0.35)]' : 'shadow-[0_8px_20px_rgba(0,0,0,0.3)]'
                } ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.w,
                  height: box.h,
                  transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
                  background: `linear-gradient(160deg, color-mix(in oklab, ${b.color} 92%, white), color-mix(in oklab, ${b.color} 78%, black))`,
                  color: ink,
                  zIndex: selected ? 50 : 1 + b.z,
                }}
              >
                <span className="line-clamp-2 break-words text-[20px] font-semibold leading-tight">{b.label}</span>
                {b.person && (
                  <span className="mt-1 line-clamp-1 text-[15px] opacity-90">{personName(b.person)}</span>
                )}
                {selected && canEdit && (
                  <span
                    data-handle={b.id}
                    aria-label={`Resize ${b.label}`}
                    role="button"
                    className="absolute bottom-0 right-0 h-7 w-7 cursor-nwse-resize rounded-tl-[12px] bg-white/90 shadow-[inset_0_0_0_2px_var(--color-primary)]"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Zoom, pinned to the top corner: the bottom is where the dock sits on a phone. */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-surface-container/90 p-1 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 backdrop-blur dark:ring-white/15">
        <ZoomButton label="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
          −
        </ZoomButton>
        <button
          type="button"
          onClick={fit}
          aria-label="Fit the whole stage"
          className="tap rounded-full px-2 font-mono text-label-sm tabular text-on-surface hover:bg-surface-low"
        >
          {percent}%
        </button>
        <ZoomButton label="Zoom in" onClick={() => zoomAt(1.25)}>
          +
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap flex h-9 w-9 items-center justify-center rounded-full text-headline-sm leading-none text-on-surface hover:bg-surface-low"
    >
      {children}
    </button>
  )
}

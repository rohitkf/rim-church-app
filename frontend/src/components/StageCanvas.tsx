import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  alignBlock,
  type Guide,
  clampBlock,
  fitScale,
  inkOn,
  personName,
  regionAt,
  snap,
  workspaceOf,
  type Region,
  type StageBlock,
} from '../lib/stage'
import { stageIcon } from '../lib/stageIcons'

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

/** The part of a block the canvas can change: its place in its region, and which region. */
export type BlockBox = { x: number; y: number; w: number; h: number; area_id: string }

type Gesture =
  | { kind: 'pan'; pointer: number; startX: number; startY: number; tx: number; ty: number; moved: boolean }
  | { kind: 'drag'; pointer: number; id: string; grabX: number; grabY: number; moved: boolean }
  | { kind: 'resize'; pointer: number; id: string; startW: number; startH: number; startX: number; startY: number }
  /** A finger on a block that will not move: if it pulls, the caller is told once. */
  | { kind: 'held'; pointer: number; id: string; startX: number; startY: number }
  | { kind: 'pinch'; a: number; b: number; startDist: number; startScale: number; midX: number; midY: number }

export function StageCanvas({
  regions,
  blocks,
  selectedId,
  onSelect,
  canEdit,
  onCommit,
  onDelete,
  onDuplicate,
  canMove,
  proposing = null,
  onPropose,
  onRefused,
  className = '',
}: {
  /** The areas, laid out as regions of one workspace (lib/stage regionsOf). */
  regions: Region[]
  blocks: StageBlock[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Whether blocks may be dragged and resized here at all. */
  canEdit: boolean
  /** A gesture has finished: this block is now here. */
  onCommit: (id: string, box: BlockBox) => void
  /** Delete pressed on the keyboard with a block selected. */
  onDelete?: (id: string) => void
  /** Ctrl/Cmd+D with a block selected. */
  onDuplicate?: (id: string) => void
  /** Whether this one block may be dragged at all: a locked block is not, by anybody, until it is unlocked. */
  canMove?: (block: StageBlock) => boolean
  /** Somebody tried to drag or resize a block that cannot move: a chance to say why. */
  onRefused?: (id: string) => void
  /** A locked block being dragged to where somebody would like it: the drop is an ask, not a move. */
  proposing?: string | null
  onPropose?: (id: string, box: BlockBox) => void
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scale: 0.5, tx: 0, ty: 0 })
  const [live, setLive] = useState<{ id: string; box: BlockBox } | null>(null)
  /** Smart guides for the gesture in hand, in the units of the region named. */
  const [guides, setGuides] = useState<{ area_id: string; lines: Guide[] } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  // Only for the cursor: a ref is not read during render.
  const [panning, setPanning] = useState(false)
  const { width: stageW, height: stageH } = workspaceOf(regions)
  const regionOf = (b: StageBlock) => regions.find((r) => r.area.id === b.area_id) ?? regions[0]
  /** A block's box in workspace units. */
  const placed = (b: StageBlock): BlockBox => {
    const r = regionOf(b)
    return { x: b.x + (r?.left ?? 0), y: b.y + (r?.top ?? 0), w: b.w, h: b.h, area_id: b.area_id }
  }
  /** A workspace box back into a region's own units: the region it lands in, clamped inside it. */
  const settle = (box: { x: number; y: number; w: number; h: number }): BlockBox | null => {
    const r = regionAt(regions, box.x + box.w / 2, box.y + box.h / 2)
    if (!r) return null
    const local = clampBlock({ x: box.x - r.left, y: box.y - r.top, w: box.w, h: box.h }, { width: r.width, height: r.height })
    return { ...local, area_id: r.area.id }
  }

  // Keyed on the two numbers, not the stage object: a parent that builds
  // that object fresh each render must not make this a new function each
  // render, or everything below that depends on it runs again.
  const fit = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const scale = fitScale({ width: stageW, height: stageH }, rect)
    setView({
      scale,
      tx: (rect.width - stageW * scale) / 2,
      ty: (rect.height - stageH * scale) / 2,
    })
  }, [stageW, stageH])

  // Fit when the stage appears or changes size, and again only if the box
  // itself changes shape. A ResizeObserver reports once on observe and
  // again on every layout nudge, so it is held to a real change of size:
  // without that, selecting a block re-fitted the stage and threw away
  // whatever zoom the person had set.
  useLayoutEffect(() => {
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const el = boxRef.current
    if (!el) return
    let last = { w: el.clientWidth, h: el.clientHeight }
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === last.w && h === last.h) return
      last = { w, h }
      fit()
    })
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
  const movable = (b: StageBlock) => (canEdit && (canMove ? canMove(b) : true)) || proposing === b.id

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

    if (handle) {
      const id = handle.dataset.handle!
      const b = blockById(id)
      if (!b) return
      if (!movable(b)) {
        gesture.current = { kind: 'held', pointer: e.pointerId, id, startX: e.clientX, startY: e.clientY }
        onSelect(id)
        return
      }
      gesture.current = { kind: 'resize', pointer: e.pointerId, id, startW: b.w, startH: b.h, startX: world.x, startY: world.y }
      onSelect(id)
      return
    }
    if (blockEl) {
      const id = blockEl.dataset.block!
      onSelect(id)
      const b = blockById(id)
      if (!b) return
      if (!movable(b)) {
        gesture.current = { kind: 'held', pointer: e.pointerId, id, startX: e.clientX, startY: e.clientY }
        return
      }
      const was = placed(b)
      gesture.current = { kind: 'drag', pointer: e.pointerId, id, grabX: world.x - was.x, grabY: world.y - was.y, moved: false }
      return
    }
    gesture.current = { kind: 'pan', pointer: e.pointerId, startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty, moved: false }
    setPanning(true)
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
    if (g.kind === 'held') {
      if (Math.abs(e.clientX - g.startX) + Math.abs(e.clientY - g.startY) > 6) {
        gesture.current = null
        onRefused?.(g.id)
      }
      return
    }
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
    const was = placed(b)
    // Smart guides reach a few screen pixels, whatever the zoom; capped so a
    // zoomed-out stage does not pull a block right across the grid.
    const reach = Math.min(25, Math.max(6, 8 / view.scale))
    const neighbours = (areaId: string) => blocks.filter((o) => o.id !== b.id && o.area_id === areaId)
    if (g.kind === 'drag') {
      const next = settle({ x: snap(world.x - g.grabX), y: snap(world.y - g.grabY), w: b.w, h: b.h })
      if (!next) return
      const r = regions.find((x) => x.area.id === next.area_id)
      const size = { width: r?.width ?? was.w, height: r?.height ?? was.h }
      const aligned = alignBlock(next, neighbours(next.area_id), size, reach, 'move')
      const box = { ...clampBlock(aligned, size), area_id: next.area_id }
      if (box.x !== b.x || box.y !== b.y || box.area_id !== b.area_id) g.moved = true
      setLive({ id: g.id, box })
      setGuides(aligned.guides.length ? { area_id: next.area_id, lines: aligned.guides } : null)
    } else {
      const r = regionOf(b)
      const size = { width: r?.width ?? was.w, height: r?.height ?? was.h }
      const wanted = { x: b.x, y: b.y, w: snap(g.startW + (world.x - g.startX)), h: snap(g.startH + (world.y - g.startY)) }
      const aligned = alignBlock(wanted, neighbours(b.area_id), size, reach, 'resize')
      setLive({ id: g.id, box: { ...clampBlock(aligned, size), area_id: b.area_id } })
      setGuides(aligned.guides.length ? { area_id: b.area_id, lines: aligned.guides } : null)
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
    if (g.kind === 'held') return
    if (g.kind === 'pan') {
      setPanning(false)
      if (!g.moved) onSelect(null)
      return
    }
    if (live && live.id === g.id) {
      const b = blockById(g.id)
      if (b && (live.box.x !== b.x || live.box.y !== b.y || live.box.w !== b.w || live.box.h !== b.h || live.box.area_id !== b.area_id)) {
        if (proposing === g.id && onPropose) onPropose(g.id, live.box)
        else onCommit(g.id, live.box)
      }
    }
    setLive(null)
    setGuides(null)
  }

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedId) return
    const b = blockById(selectedId)
    if (!b) return
    if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && onDuplicate) {
      e.preventDefault()
      onDuplicate(b.id)
      return
    }
    if (!movable(b) || proposing === b.id) return
    const step = e.shiftKey ? 50 : 10
    const nudge = (dx: number, dy: number) => {
      e.preventDefault()
      const r = regionOf(b)
      const local = clampBlock({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, { width: r?.width ?? stageW, height: r?.height ?? stageH })
      onCommit(b.id, { ...local, area_id: b.area_id })
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
        style={{ cursor: panning ? 'grabbing' : 'default' }}
      >
        <div
          data-stage
          className="absolute left-0 top-0"
          style={{
            width: stageW,
            height: stageH,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Each area is a panel of the one workspace: its name in the
              corner, its far edge along the top, its near edge along the
              bottom. */}
          {regions.map((r) => (
            <div
              key={r.area.id}
              data-region={r.area.id}
              className="absolute rounded-[18px] bg-surface-lowest shadow-[var(--shadow-lifted)] ring-1 ring-white/10"
              style={{
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                backgroundImage:
                  'radial-gradient(circle, color-mix(in oklab, var(--color-on-surface) 14%, transparent) 1.2px, transparent 1.3px)',
                backgroundSize: '40px 40px',
                backgroundPosition: '20px 20px',
              }}
            >
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-t-[18px] bg-raised-strong font-mono text-[13px] uppercase tracking-[0.18em] text-on-surface-faint"
              >
                {r.area.top_label}
              </div>
              <span className="absolute left-4 top-0 flex h-9 items-center font-mono text-[12px] uppercase tracking-[0.18em] text-on-surface">{r.area.name}</span>
              {/* Smart guides: a thin line where the block in hand has met a neighbour's edge or centre. */}
              {guides?.area_id === r.area.id &&
                guides.lines.map((gl, i) => (
                  <div
                    key={i}
                    data-guide={gl.axis}
                    aria-hidden="true"
                    className="pointer-events-none absolute z-[60] bg-[var(--color-accent-red)]"
                    style={
                      gl.axis === 'x'
                        ? { left: gl.at - 0.75 / view.scale, top: gl.from, width: 1.5 / view.scale, height: gl.to - gl.from }
                        : { top: gl.at - 0.75 / view.scale, left: gl.from, height: 1.5 / view.scale, width: gl.to - gl.from }
                    }
                  />
                ))}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 flex h-9 items-center justify-center rounded-b-[18px] border-t-2 border-dashed border-primary/50 font-mono text-[13px] uppercase tracking-[0.18em] text-accent-blue-soft"
              >
                {r.area.bottom_label}
              </div>
            </div>
          ))}

          {blocks.map((b) => {
            const own = placed(b)
            const box =
              live && live.id === b.id
                ? (() => {
                    const r = regions.find((x) => x.area.id === live.box.area_id)
                    return { x: live.box.x + (r?.left ?? 0), y: live.box.y + (r?.top ?? 0), w: live.box.w, h: live.box.h }
                  })()
                : own
            const selected = b.id === selectedId
            const ink = inkOn(b.color)
            const locked = !!b.locked_at
            const draggable = movable(b)
            const ghost = proposing === b.id && live?.id === b.id
            // An item is a line picture in its colour with its name beneath, on no box;
            // an item whose picture the app no longer knows is a plain block.
            const icon = b.kind === 'item' ? stageIcon(b.icon) : null
            const corner = b.corners === 'rounded' ? 'rounded-[14px]' : 'rounded-none'
            return (
              <div
                key={b.id}
                data-block={b.id}
                role="button"
                aria-label={`${b.kind === 'seats' ? `${b.label}, ${b.seats} seats` : b.person ? `${b.label}, ${personName(b.person)}` : b.label}${locked ? ' (locked)' : ''}`}
                aria-pressed={selected}
                className={`absolute flex flex-col items-center justify-center overflow-hidden ${corner} px-2 text-center transition-shadow ${
                  selected
                    ? 'shadow-[0_0_0_4px_var(--color-primary),0_12px_30px_rgba(0,0,0,0.35)]'
                    : icon
                      ? ''
                      : 'shadow-[0_8px_20px_rgba(0,0,0,0.3)]'
                } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${ghost ? 'opacity-70 outline-dashed outline-2 outline-white/80' : ''}`}
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.w,
                  height: box.h,
                  transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
                  background: icon
                    ? selected
                      ? 'color-mix(in oklab, var(--color-primary) 10%, transparent)'
                      : undefined
                    : `linear-gradient(160deg, color-mix(in oklab, ${b.color} 92%, white), color-mix(in oklab, ${b.color} 78%, black))`,
                  color: icon ? 'var(--color-on-surface)' : ink,
                  zIndex: selected ? 50 : 1 + b.z,
                }}
              >
                {icon ? (
                  <>
                    <svg
                      data-icon={icon.key}
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={b.color}
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="min-h-0 w-full flex-1"
                    >
                      <path d={icon.d} />
                    </svg>
                    <span className="line-clamp-1 text-[15px] font-semibold leading-tight">{b.label}</span>
                    {b.person && <span className="line-clamp-1 text-[13px] opacity-80">{personName(b.person)}</span>}
                  </>
                ) : b.kind === 'seats' ? (
                  <SeatRow label={b.label} seats={b.seats} width={box.w} height={box.h} />
                ) : (
                  <>
                    <span className="line-clamp-2 break-words text-[20px] font-semibold leading-tight">{b.label}</span>
                    {b.person && (
                      <span className="mt-1 line-clamp-1 text-[15px] opacity-90">{personName(b.person)}</span>
                    )}
                  </>
                )}
                {locked && (
                  <span aria-hidden="true" className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/35">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </span>
                )}
                {selected && draggable && (
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

      {/* Zoom, in a row under the box rather than floating over it: anything
          floating over the canvas covers a block in that corner. */}
      <div className="mt-2 flex items-center justify-end gap-1">
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

/**
 * A row of chairs. However many seats, they share the width: a wide row
 * of six has roomy chairs, a tight row of thirty has small ones, and the
 * label sits in the top corner so the chairs are what you see.
 */
function SeatRow({ label, seats, width, height }: { label: string; seats: number; width: number; height: number }) {
  const n = Math.max(1, seats)
  const gap = 4
  const chair = Math.max(6, Math.min(height - 26, (width - 16 - gap * (n - 1)) / n))
  return (
    <span className="absolute inset-0 flex flex-col px-2 pt-1">
      <span className="line-clamp-1 text-left text-[13px] font-semibold leading-tight opacity-90">
        {label} · {seats}
      </span>
      <span className="flex flex-1 items-center justify-center" style={{ gap }} aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className="shrink-0 rounded-[30%_30%_14%_14%] bg-current opacity-80"
            style={{ width: chair, height: chair * 0.9 }}
          />
        ))}
      </span>
    </span>
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

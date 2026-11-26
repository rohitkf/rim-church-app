import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { edgeSentence, edgeText, type Graph, type GraphNode } from '../lib/familyGraph'
import { CIRCLE, LETTER, layoutGraph, type Point } from '../lib/graphLayout'

/**
 * Families drawn as a graph (the Owner, November 2026: "like a graph
 * kinda one like neo4j where relationships between nodes are all
 * connected and named and labelled properly").
 *
 * Everybody is a round node with their name under it, and every
 * relationship is a straight line with what the people on it are to each
 * other written along it: "Husband · Wife" over the line between the two,
 * each word on its own person's side; "Son" on the line that runs to him
 * from the middle of his parents'; "Father · Daughter" on the line
 * between a parent alone and their child. It replaced two trees drawn the
 * way an org chart is, in boxes and rows, where a bar joined a household
 * and a line carried no word.
 *
 * Who is joined to whom is lib/familyGraph; where they go is
 * lib/graphLayout, which works the places out the same way every time.
 * This draws it, and is how it is moved about in:
 *
 *   - It scrolls inside its own box, both ways, with a finger or a wheel.
 *     Dragging the background to pan would take the finger that scrolls
 *     the page.
 *   - Zoom in, Zoom out and Fit are buttons; two fingers pinch it bigger
 *     and smaller on a phone, and Ctrl or ⌘ with the wheel does on a
 *     computer. It opens at a size its words can be read at, on the
 *     person it is about where there is one, even when that means the far
 *     side of a big family is a scroll away.
 *   - Somebody can be dragged to another place with a mouse or a pen, and
 *     their lines follow; Reset puts everybody back. Not with a finger:
 *     a finger on somebody is as likely to be scrolling as moving them,
 *     and scrolling is what a phone cannot do without.
 *   - Pressing somebody with an account goes to their own page.
 *
 * A line is a picture, so every one is also a sentence in a list a screen
 * reader is given ("Dan Jacob is the father of Anna Thomas."), and with
 * nothing to measure (a test) that list is the whole of it.
 */

/** The size of the words on a line. How wide a letter of them is, is the layout's to know (`LETTER`): it leaves the room. */
const WORD_SIZE = 10.5
/** No smaller than this to start with: under it the words on the lines cannot be read. */
const READABLE = 0.75
const ZOOM = { least: 0.3, most: 2, step: 1.25 }
/** How far a press has to travel before it is a drag and not a press. */
const DRAG = 5

/** The middle of the line between two people: where a couple's children's lines start. */
const middle = (a: Point | undefined, b: Point | undefined): Point | undefined => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined)

const initials = (n: GraphNode) => `${n.first_name.trim().charAt(0)}${n.last_name.trim().charAt(0)}`.toUpperCase() || '?'
const nameOf = (n: GraphNode) => `${n.first_name} ${n.last_name}`.trim() || 'No name'

/**
 * The picture's own colour, opaque: the box is a faint wash over the page,
 * and something that has to hide a line behind it lays that wash over the
 * page's colour itself.
 */
const WASH = '[background:linear-gradient(var(--color-raised),var(--color-raised)),var(--color-background)]'

const controlButton =
  'tap flex h-9 min-w-9 items-center justify-center rounded-full bg-surface-lowest px-2.5 font-mono text-label-md text-on-surface hairline-strong disabled:opacity-40'

export function FamilyGraph({
  graph,
  label,
  focus,
  onOpen,
}: {
  graph: Graph
  /** What the picture is of, for whoever cannot see it. */
  label: string
  /** The node it is about: marked, in sight when it opens, and not a button. */
  focus?: string
  /** Somebody with an account was pressed: go to their own page. */
  onOpen?: (userId: string) => void
}) {
  const layout = useMemo(() => layoutGraph(graph), [graph])
  const box = useRef<HTMLDivElement>(null)
  /** How big it is drawn; null until the box has been measured. */
  const [zoom, setZoom] = useState<number | null>(null)
  const [fit, setFit] = useState(1)
  /** Where whoever has been dragged now is. Nobody, until somebody is; and nobody again for a new picture. */
  const [moved, setMoved] = useState<Record<string, Point>>({})
  const dragging = useRef<{ id: string; x: number; y: number; from: Point; far: boolean } | null>(null)
  /** A drag has just ended: the press that ends it is not a press on that person. */
  const dragged = useRef(false)
  /** What to keep still while the size changes: a place in the picture, and where in the box it is. */
  const hold = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  // Which picture has been put in place: a new family, or a new person in it, opens on them again.
  const placedFor = useRef('')
  const shape = `${graph.nodes.map((n) => n.id).join(',')}|${focus ?? ''}`

  useLayoutEffect(() => {
    const el = box.current
    if (!el || el.clientWidth === 0) return
    // The whole of it in the box, across: never drawn bigger than it is.
    const whole = Math.min(1, el.clientWidth / layout.width)
    setFit(whole)
    if (placedFor.current === shape) return
    placedFor.current = shape
    const start = Math.max(whole, Math.min(1, READABLE))
    setZoom(start)
    setMoved((was) => (Object.keys(was).length ? {} : was))
    // On the person it is about; with nobody, on the middle of the top.
    const centre = focus ? layout.at.get(focus) : undefined
    requestAnimationFrame(() => {
      if (!box.current) return
      box.current.scrollLeft = (centre ? centre.x : layout.width / 2) * start - box.current.clientWidth / 2
      box.current.scrollTop = centre ? centre.y * start - box.current.clientHeight / 2 : 0
    })
  }, [layout, shape, focus])

  const scale = zoom ?? 1
  // Never smaller than the smallest size, except to fit: the whole of a big family on a phone is smaller still.
  const least = Math.min(ZOOM.least, fit)
  /** Change the size, keeping the place under `at` (a point on the screen) where it is; the middle of the box by default. */
  const to = (next: number, at?: { x: number; y: number }) => {
    const el = box.current
    const clamped = Math.min(ZOOM.most, Math.max(least, next))
    // Nothing to change: nothing to hold either, or it would be put back at some later change of size.
    if (clamped === scale) return
    if (el) {
      const r = el.getBoundingClientRect()
      const left = at ? at.x - r.left : el.clientWidth / 2
      const top = at ? at.y - r.top : el.clientHeight / 2
      hold.current = { x: (el.scrollLeft + left) / scale, y: (el.scrollTop + top) / scale, left, top }
    }
    setZoom(clamped)
  }
  // Once it is drawn at the new size, the place that was held is put back where it was.
  useLayoutEffect(() => {
    const el = box.current
    const h = hold.current
    if (!el || !h || zoom === null) return
    hold.current = null
    el.scrollLeft = h.x * zoom - h.left
    el.scrollTop = h.y * zoom - h.top
  }, [zoom])

  // The latest size and the way to change it, for listeners that are set up once.
  const live = useRef({ scale, to })
  useLayoutEffect(() => {
    live.current = { scale, to }
  })
  useEffect(() => {
    const el = box.current
    if (!el) return
    // Two fingers: bigger and smaller, about the place between them. One finger is left alone to scroll.
    let pinch: { apart: number; scale: number } | null = null
    const spread = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { apart: spread(e), scale: live.current.scale }
    }
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      // Ours, not the browser's: it would scroll the box, or zoom the whole page.
      e.preventDefault()
      const between = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 }
      live.current.to((pinch.scale * spread(e)) / (pinch.apart || 1), between)
    }
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null
    }
    // Ctrl or ⌘ with the wheel, which is also what a pinch on a trackpad sends.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      live.current.to(live.current.scale * Math.exp(-e.deltaY * 0.0025), { x: e.clientX, y: e.clientY })
    }
    // Not passive: they have to be able to stop the browser doing its own thing with the gesture.
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  /** Where somebody is: where they were dragged to, or where the layout put them. */
  const place = (id: string): Point | undefined => moved[id] ?? layout.at.get(id)
  const anyMoved = Object.keys(moved).length > 0

  return (
    <figure aria-label={label} className="m-0">
      <div className="relative rounded-[var(--radius-card)] bg-raised hairline">
        {/* In a strip of their own over the picture, not floating on it: there they sat on whoever was top right. */}
        <div className="flex items-center justify-between gap-2 px-2 pt-2">
          {/* How it is moved about in, said once and briefly, for whichever of the two is in the hand. */}
          <p className="min-w-0 pl-1.5 text-label-sm text-on-surface-faint">
            <span className="[@media(pointer:fine)]:hidden">Pinch to zoom</span>
            <span className="hidden [@media(pointer:fine)]:inline">Drag somebody to move them</span>
          </p>
          <div role="group" aria-label="Size of the picture" className="flex shrink-0 gap-1.5">
            {anyMoved && (
              <button type="button" onClick={() => setMoved({})} aria-label="Put everybody back where they were" className={controlButton}>
                Reset
              </button>
            )}
            <button type="button" onClick={() => to(scale / ZOOM.step)} disabled={scale <= least + 0.001} aria-label="Zoom out" className={controlButton}>
              <span aria-hidden="true">−</span>
            </button>
            <button type="button" onClick={() => to(scale * ZOOM.step)} disabled={scale >= ZOOM.most - 0.001} aria-label="Zoom in" className={controlButton}>
              <span aria-hidden="true">+</span>
            </button>
            <button type="button" onClick={() => to(fit)} disabled={Math.abs(scale - fit) < 0.001} aria-label="Fit the whole picture in" className={controlButton}>
              Fit
            </button>
          </div>
        </div>

        <div
          ref={box}
          data-graph-box
          // A box that scrolls has to be reachable without a mouse: focused, the arrow keys move the picture.
          tabIndex={0}
          role="group"
          aria-label={`${label}: scroll to see all of it`}
          // Its own scrolling, both ways; and it does not hand the scroll on to the page at its edge sideways.
          // `touch-action`: one finger scrolls it; two are ours to make it bigger and smaller, not the browser's to zoom the page.
          className="max-h-[70dvh] touch-pan-x touch-pan-y overflow-auto overscroll-x-contain rounded-b-[var(--radius-card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {/* As big as the picture is at this size, so the box scrolls by exactly that much. */}
          <div className="relative mx-auto" style={{ width: layout.width * scale, height: layout.height * scale }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
              <svg aria-hidden="true" width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0 overflow-visible">
                {graph.edges.map((e) => {
                  // From where to where: between two people, or from the middle of a couple's line to their child.
                  const ends: [Point | undefined, Point | undefined] =
                    e.kind === 'hub' ? [middle(place(e.couple[0]), place(e.couple[1])), place(e.child)] : [place(e.a), place(e.b)]
                  const [a, b] = ends
                  if (!a || !b) return null
                  // The words run left to right, so the start of the line is whoever is on the left (or above, for one straight down).
                  const aFirst = a.x < b.x || (a.x === b.x && a.y <= b.y)
                  const [from, till] = aFirst ? [a, b] : [b, a]
                  const text = edgeText(e, aFirst)
                  const wide = text.length * LETTER + 12
                  const angle = (Math.atan2(till.y - from.y, till.x - from.x) * 180) / Math.PI
                  // A couple's words are over the middle of their line, clear of where their children's lines leave it.
                  // A child's are nearer the child than the parents, where the lines of brothers and sisters have parted.
                  const couple = e.kind === 'spouse'
                  const along = couple ? 0.5 : e.kind === 'sibling' ? 0.5 : 0.58
                  const x = a.x + (b.x - a.x) * along
                  const y = a.y + (b.y - a.y) * along
                  return (
                    <g key={e.id} data-graph-edge={e.id}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-on-surface-faint" strokeWidth={1.5} strokeLinecap="round" />
                      {e.kind !== 'hub' && e.hub && <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={3.5} className="fill-on-surface-faint" />}
                      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
                        {!couple && (
                          <>
                            {/* The picture's own colour, built up the way the picture is: a faint wash over the page.
                                The wash alone lets the line show through the letters. */}
                            <rect x={-wide / 2} y={-8} width={wide} height={16} rx={8} className="fill-background" />
                            <rect x={-wide / 2} y={-8} width={wide} height={16} rx={8} className="fill-raised" />
                          </>
                        )}
                        <text
                          data-graph-words
                          y={couple ? -11 : 0}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="fill-on-surface-variant font-mono"
                          style={{ fontSize: WORD_SIZE }}
                        >
                          {text}
                        </text>
                      </g>
                    </g>
                  )
                })}
              </svg>

              <ul aria-label="People" className="m-0 list-none p-0">
                {graph.nodes.map((n) => {
                  const p = place(n.id)
                  if (!p) return null
                  const me = n.id === focus
                  const circle = `flex shrink-0 items-center justify-center rounded-full font-mono text-label-md ${
                    me
                      ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : n.userId
                        ? 'bg-surface-lowest text-on-surface hairline-strong'
                        : // Said by its outline as well as in words: somebody not on the app.
                          'border border-dashed border-on-surface-faint bg-surface text-on-surface-variant'
                  }`
                  const inner = (
                    <>
                      <span aria-hidden="true" className={circle} style={{ width: CIRCLE, height: CIRCLE }}>
                        {initials(n)}
                      </span>
                      {/* On the picture's own colour, so a line going down from the circle stops at the name. */}
                      <span className={`rounded-md px-1 text-center text-label-sm font-medium leading-tight text-on-surface [overflow-wrap:anywhere] ${WASH}`}>
                        {nameOf(n)}
                      </span>
                      {!n.userId && <span className={`rounded px-1 font-mono text-[0.625rem] leading-tight text-on-surface-faint ${WASH}`}>Written in</span>}
                    </>
                  )
                  const shell = 'flex w-28 flex-col items-center gap-1'
                  return (
                    <li
                      key={n.id}
                      data-graph-node={n.id}
                      // The middle of the circle is where the lines meet.
                      className="absolute z-[1] -translate-x-1/2 [@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:select-none"
                      style={{ left: p.x, top: p.y - CIRCLE / 2 }}
                      // Dragged to another place, with a mouse or a pen: a finger on somebody is left to scroll.
                      onPointerDown={(e) => {
                        dragged.current = false
                        if (e.pointerType === 'touch' || e.button !== 0) return
                        dragging.current = { id: n.id, x: e.clientX, y: e.clientY, from: p, far: false }
                      }}
                      onPointerMove={(e) => {
                        const d = dragging.current
                        if (!d || d.id !== n.id) return
                        const dx = e.clientX - d.x
                        const dy = e.clientY - d.y
                        if (!d.far) {
                          if (Math.hypot(dx, dy) < DRAG) return
                          d.far = true
                          // From here every move is theirs, wherever the pointer gets to.
                          e.currentTarget.setPointerCapture?.(e.pointerId)
                        }
                        // Inside the picture, with room for the name under them.
                        const x = Math.min(layout.width - CIRCLE / 2, Math.max(CIRCLE / 2, d.from.x + dx / scale))
                        const y = Math.min(layout.height - CIRCLE / 2 - 30, Math.max(CIRCLE / 2, d.from.y + dy / scale))
                        setMoved((was) => ({ ...was, [n.id]: { x, y } }))
                      }}
                      onPointerUp={() => {
                        dragged.current = !!dragging.current?.far
                        dragging.current = null
                      }}
                      onPointerCancel={() => {
                        dragging.current = null
                      }}
                      // The press that ends a drag is not a press on them: it does not open their page.
                      onClickCapture={(e) => {
                        if (!dragged.current) return
                        dragged.current = false
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                    >
                      {n.userId && !me && onOpen ? (
                        <button type="button" onClick={() => onOpen(n.userId!)} aria-label={`${nameOf(n)}. Open their family`} className={`${shell} tap`}>
                          {inner}
                        </button>
                      ) : (
                        <div aria-current={me ? 'true' : undefined} className={shell}>
                          {inner}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Every line, as a sentence: a screen reader has no picture to read them from. */}
      {graph.edges.length > 0 && (
        <ul aria-label="Who is what to whom" className="sr-only">
          {graph.edges.map((e) => (
            <li key={e.id}>{edgeSentence(e, graph)}</li>
          ))}
        </ul>
      )}
    </figure>
  )
}

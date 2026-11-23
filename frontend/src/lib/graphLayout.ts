import { edgeLetters, type Graph, type GraphUnit } from './familyGraph'

/*
 * Where the nodes of a family graph go.
 *
 * Everybody stands on the level of their generation, a couple side by
 * side, their children spread under the middle of the two, and a child
 * with a household of their own has that household's width to themselves
 * so their own children fit under them. It is worked out from the top
 * down with nothing random in it: the same family is the same picture
 * every time it is opened, no two people are ever in one place, and no
 * line from parents to children crosses another.
 *
 * The first cut let the nodes find their own places, pushing and pulling
 * each other the way a graph database's browser does. A family is not a
 * web: it settled seven children in a knot under their parents with the
 * words of their lines on top of each other.
 *
 * Families are set side by side, in rows; everybody linked to nobody goes
 * in a block after them.
 */

export interface Point {
  x: number
  y: number
}

export interface Layout {
  /** The middle of each node's circle, by node id. */
  at: Map<string, Point>
  width: number
  height: number
}

/** A node's circle, across. */
export const CIRCLE = 56
/** How wide one letter of a line's words is: they are in the fixed-width face. */
export const LETTER = 6.3
/** Room for one person, across: a circle and the name under it, and air. */
const SLOT = 150
/** How far apart generations stand: a line down has room for "Father · Daughter" under a name. */
const LEVEL = 230
/** Space left round each family. */
const PAD = 60
/** How wide a row of families may be before the next starts a new row. */
const ROW = 1600
/** Somebody linked to nobody: how much room each has, across and down. */
const LONE = { w: 130, h: 118 }

/** Two people side by side with a line between them: far enough apart for its words. */
const apart = (letters: number) => Math.max(SLOT, CIRCLE + letters * LETTER + 44)

function family(units: GraphUnit[], graph: Graph): { at: Map<string, Point>; w: number; h: number } {
  const generation = new Map(graph.nodes.map((n) => [n.id, n.generation]))
  // How far apart the two of a line stand, by the two of them.
  const gap = new Map<string, number>()
  for (const e of graph.edges) if (e.kind !== 'hub') gap.set([e.a, e.b].sort().join('|'), apart(edgeLetters(e)))
  const between = (a: string, b: string) => gap.get([a, b].sort().join('|')) ?? SLOT

  // The household somebody is an adult of.
  const own = new Map<string, number>()
  units.forEach((u, i) => u.adults.forEach((id) => own.set(id, i)))
  // A household hangs under the household one of its adults is a child of: the first that says so.
  const under = new Map<number, { unit: number; by: string }>()
  units.forEach((u, i) => {
    for (const child of u.children) {
      const home = own.get(child)
      if (home !== undefined && home !== i && !under.has(home)) under.set(home, { unit: i, by: child })
    }
  })
  /** The children of a household that are placed under it: not one whose own household hangs somewhere else. */
  const placedHere = (i: number) => units[i].children.filter((c) => own.get(c) === undefined || under.get(own.get(c)!)?.unit === i)

  // How wide each household is with everything under it.
  const width = new Map<number, number>()
  const adultsWide = (u: GraphUnit) => (u.adults.length >= 2 ? between(u.adults[0], u.adults[1]) + SLOT : SLOT)
  /** Brothers and sisters alone are joined in a chain: each after the first stands its line's length from the last. */
  const chained = (i: number, n: number) => units[i].adults.length === 0 && n > 0
  const childWide = (i: number, c: string, n: number, all: string[]): number => {
    const home = own.get(c)
    if (home !== undefined) return wide(home)
    if (chained(i, n)) return between(all[n - 1], c)
    return SLOT
  }
  const wide = (i: number, seen = new Set<number>()): number => {
    if (width.has(i)) return width.get(i)!
    // Households that name each other as parents: the second time round it is as wide as its adults.
    if (seen.has(i)) return adultsWide(units[i])
    seen.add(i)
    const kids = placedHere(i)
    const below = kids.reduce((sum, c, n) => sum + (own.get(c) !== undefined ? wide(own.get(c)!, seen) : childWide(i, c, n, kids)), 0)
    const w = Math.max(units[i].adults.length > 0 ? adultsWide(units[i]) : 0, below, SLOT)
    width.set(i, w)
    return w
  }

  const at = new Map<string, Point>()
  const placed = new Set<number>()
  const put = (id: string, x: number) => {
    if (!at.has(id)) at.set(id, { x, y: (generation.get(id) ?? 0) * LEVEL })
  }
  const place = (i: number, left: number) => {
    if (placed.has(i)) return
    placed.add(i)
    const u = units[i]
    const w = wide(i)
    const middle = left + w / 2
    if (u.adults.length >= 2) {
      const d = between(u.adults[0], u.adults[1])
      put(u.adults[0], middle - d / 2)
      put(u.adults[1], middle + d / 2)
    } else if (u.adults.length === 1) {
      put(u.adults[0], middle)
    }
    const kids = placedHere(i)
    const total = kids.reduce((sum, c, n) => sum + childWide(i, c, n, kids), 0)
    let x = left + (w - total) / 2
    kids.forEach((c, n) => {
      const cw = childWide(i, c, n, kids)
      const home = own.get(c)
      if (home !== undefined) place(home, x)
      // One of a chain stands the whole of its line from the last; anybody else in the middle of their room.
      else put(c, chained(i, n) ? x + cw - SLOT / 2 : x + cw / 2)
      x += cw
    })
  }

  let x = 0
  units.forEach((_, i) => {
    if (under.has(i) || placed.has(i)) return
    place(i, x)
    x += wide(i)
  })
  // Households that name each other as parents have no top: whatever is left starts its own.
  units.forEach((_, i) => {
    if (placed.has(i)) return
    place(i, x)
    x += wide(i)
  })

  const points = [...at.values()]
  const minX = Math.min(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  for (const p of points) {
    p.x = Math.round(p.x - minX + PAD + CIRCLE / 2)
    p.y = Math.round(p.y - minY + PAD + CIRCLE / 2)
  }
  return {
    at,
    w: Math.round(Math.max(...points.map((p) => p.x)) + PAD + CIRCLE / 2),
    // The name is under the circle: room for it under the lowest.
    h: Math.round(Math.max(...points.map((p) => p.y)) + PAD + CIRCLE / 2 + 30),
  }
}

/** Every node of the graph in its place. Families side by side in rows, then everybody linked to nobody. */
export function layoutGraph(graph: Graph): Layout {
  // Which family each household is in: joined wherever two share a person.
  const group = graph.units.map((_, i) => i)
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  const seenIn = new Map<string, number>()
  graph.units.forEach((u, i) => {
    for (const id of [...u.adults, ...u.children]) {
      const before = seenIn.get(id)
      if (before === undefined) seenIn.set(id, i)
      else group[find(i)] = find(before)
    }
  })
  const families = new Map<number, GraphUnit[]>()
  graph.units.forEach((u, i) => families.set(find(i), [...(families.get(find(i)) ?? []), u]))

  const at = new Map<string, Point>()
  let x = 0
  let y = 0
  let rowHeight = 0
  let width = 0
  for (const units of families.values()) {
    const placed = family(units, graph)
    if (x > 0 && x + placed.w > ROW) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }
    for (const [id, p] of placed.at) at.set(id, { x: p.x + x, y: p.y + y })
    x += placed.w
    width = Math.max(width, x)
    rowHeight = Math.max(rowHeight, placed.h)
  }
  y += rowHeight

  const lone = graph.nodes.filter((n) => !at.has(n.id))
  if (lone.length > 0) {
    // As many across as the families are wide, and never fewer than a phone holds.
    const across = Math.max(2, Math.min(lone.length, Math.floor(Math.max(width, LONE.w * 2) / LONE.w)))
    lone.forEach((n, i) => {
      at.set(n.id, { x: (i % across) * LONE.w + LONE.w / 2, y: y + Math.floor(i / across) * LONE.h + 50 })
    })
    width = Math.max(width, Math.min(lone.length, across) * LONE.w)
    y += Math.ceil(lone.length / across) * LONE.h + 10
  }
  return { at, width: Math.max(width, LONE.w), height: Math.max(y, LONE.h) }
}

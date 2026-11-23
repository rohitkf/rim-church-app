/*
 * The lines of a family tree, worked out from where the boxes are.
 *
 * A tree here is laid out by the page, as rows of boxes, and its lines
 * are measured off the boxes once they are on the screen and drawn behind
 * them (components/FamilyTree, components/FamilyForest). So a long name
 * makes a taller box and the lines still meet it, and a row too wide for
 * a phone can wrap. This file is the measuring and the geometry, with
 * nothing of who is related to whom in it: each function hands back SVG
 * path data for whoever draws.
 */

/** A box in the tree, measured from the top left of the frame the lines are drawn in. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
  /** The middle, left to right: where a line comes down onto it. */
  cx: number
}

/** Where the box with this key is, or null when it is not on the screen. */
export function boxOf(frame: HTMLElement, base: DOMRect, key: string): Box | null {
  const node = frame.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(key)}"]`)
  if (!node) return null
  const r = node.getBoundingClientRect()
  return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, cx: r.left - base.left + r.width / 2 }
}

/** A couple: a line between each box and the next, half way up. */
export function joinLines(boxes: readonly Box[]): string[] {
  const out: string[] = []
  for (let i = 0; i + 1 < boxes.length; i += 1) {
    // Side by side only: two that wrapped onto different rows have no line to draw between them.
    if (Math.abs(boxes[i].y - boxes[i + 1].y) >= 4) continue
    const y = boxes[i].y + Math.min(boxes[i].h, boxes[i + 1].h) / 2
    out.push(`M ${boxes[i].x + boxes[i].w} ${y} H ${boxes[i + 1].x}`)
  }
  return out
}

/** Where the children of these adults hang from: between two of them, or under one. */
export function stemFrom(adults: readonly Box[]): { x: number; y: number } | null {
  if (adults.length === 0) return null
  const [a, b] = adults
  if (b && Math.abs(a.y - b.y) < 4) return { x: (a.x + a.w + b.x) / 2, y: a.y + Math.min(a.h, b.h) / 2 }
  return { x: a.cx, y: a.y + a.h }
}

/**
 * One generation hung from the one above: a stem from `from` (where there
 * is somebody above) to a bar, and a drop from the bar to each box. The
 * boxes are taken as the screen laid them out: one row, or several where
 * they wrapped. A second row cannot be reached through the first, so a
 * rail runs down the side and a bar along each row. `floor` is the bottom
 * of whatever is above: the bar is half way between it and the row.
 */
export function hangLines(from: { x: number; y: number } | null, floor: number, below: readonly Box[]): string[] {
  return hang(from, floor, below).lines
}

/** A drop onto one box: from the bar at `from` down to the box's top. Where a word for that line can be written. */
export interface Drop {
  box: Box
  /** How far down the bar is that the drop leaves. */
  from: number
}

/**
 * `hangLines`, with where each drop is as well as the lines: a tree that
 * writes what somebody is on the line that reaches them (FamilyTree) has
 * to know where that line runs.
 */
export function hang(from: { x: number; y: number } | null, floor: number, below: readonly Box[]): { lines: string[]; drops: Drop[] } {
  const out: string[] = []
  const drops: Drop[] = []
  if (below.length === 0) return { lines: out, drops }
  const rows: Box[][] = []
  for (const b of [...below].sort((a, c) => a.y - c.y || a.x - c.x)) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(last[0].y - b.y) < 4) last.push(b)
    else rows.push([b])
  }
  // Clear of every box.
  const rail = Math.min(...below.map((b) => b.x)) - 9
  let firstBar = 0
  const placed: Box[] = []
  rows.forEach((row, i) => {
    const xs = row.map((b) => b.cx)
    if (i > 0) {
      // Under what is over this row and nothing else: a tall box further along
      // (a household beside a wrapped row of children) is not in this bar's way.
      const right = Math.max(...row.map((b) => b.x + b.w))
      const over = placed.filter((b) => b.x < right)
      floor = Math.max(...(over.length > 0 ? over : placed).map((b) => b.y + b.h))
    }
    const bar = floor + (row[0].y - floor) / 2
    if (i === 0) {
      firstBar = bar
      if (from) out.push(`M ${from.x} ${from.y} V ${bar}`)
      const reach = [...(from ? [from.x] : []), ...(rows.length > 1 ? [rail] : []), ...xs]
      if (Math.max(...reach) > Math.min(...reach)) out.push(`M ${Math.min(...reach)} ${bar} H ${Math.max(...reach)}`)
    } else {
      out.push(`M ${rail} ${bar} H ${Math.max(...xs)}`)
      if (i === rows.length - 1) out.push(`M ${rail} ${firstBar} V ${bar}`)
    }
    for (const b of row) {
      out.push(`M ${b.cx} ${bar} V ${b.y}`)
      drops.push({ box: b, from: bar })
    }
    placed.push(...row)
  })
  return { lines: out, drops }
}

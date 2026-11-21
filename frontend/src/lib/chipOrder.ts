/**
 * Where a chip being dragged belongs among the others.
 *
 * A list of rows is reordered along one line: past the middle of the row
 * above or below, and the two swap (lib/useDragReorder). Chips wrap. The
 * same four names are one row on a laptop and a column on a phone, and
 * anything between when one of them is long — so "above" and "below" are
 * not enough, and neither is "left" and "right".
 *
 * So the question is asked of each other chip in turn: is the one in hand
 * past it, the way the page is read? Its place is however many it is past.
 * Kept apart from the pointer handling (lib/useChipReorder) because this
 * half can be reasoned about, and tested, without a finger.
 */

/** Where a chip rests on the page: the box it takes up with nothing in hand. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Two boxes on the same line: each covers more than half the other's height. */
function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return overlap > Math.min(a.height, b.height) / 2
}

/**
 * The place (0 is first) for the chip at `held`, whose middle is now at
 * `point`. `boxes` is every chip's resting box in the order they are in,
 * the held one's own included: its empty place is still part of the line
 * it was lifted from.
 *
 * A chip that shares its line is passed sideways, at its middle. A chip
 * alone on its line — every chip, on a narrow phone — is passed downwards,
 * at its middle: asking a column to be passed sideways would move nothing
 * until the whole chip had been cleared.
 */
export function placeAmong(point: { x: number; y: number }, boxes: readonly Box[], held: number): number {
  let past = 0
  boxes.forEach((box, index) => {
    if (index === held) return
    const shared = boxes.some((other, at) => at !== index && sameLine(box, other))
    const bottom = box.top + box.height
    if (!shared) {
      if (point.y > box.top + box.height / 2) past += 1
      return
    }
    if (point.y > bottom || (point.y >= box.top && point.x > box.left + box.width / 2)) past += 1
  })
  return past
}

/**
 * `all` with the ones named in `shown` put in the order `shown` gives them,
 * and everything else left exactly where it was.
 *
 * What is drawn is not always everything held: a name that has gone from
 * the list of people is kept but not shown, and moving the ones that are
 * shown must not shuffle it off to the end.
 */
export function inShownOrder<T>(all: readonly T[], shown: readonly string[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(all.map((item) => [keyOf(item), item]))
  const queue = shown.map((key) => byKey.get(key)).filter((item): item is T => item !== undefined)
  const moving = new Set(shown)
  let next = 0
  return all.map((item) => (moving.has(keyOf(item)) ? (queue[next++] ?? item) : item))
}

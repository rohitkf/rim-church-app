/**
 * The arithmetic behind the ruler picker, kept apart from the pointer
 * handling so the half that can be reasoned about at a desk is testable.
 */

/** Steps between `min` and a value — the ruler's own coordinate. */
export function indexOf(value: number, min: number, step: number): number {
  return (value - min) / step
}

/** And back, snapped to a real step and held inside the range. */
export function valueAt(index: number, min: number, max: number, step: number): number {
  const raw = min + Math.round(index) * step
  const clamped = Math.min(Math.max(raw, min), max)
  // Floating point: 0.1 + 0.2 has no business appearing in a form field, and
  // a step of 0.5 or 0.01 is otherwise enough to produce it.
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number(clamped.toFixed(decimals))
}

/** How many steps the ruler holds, end to end. */
export function stepCount(min: number, max: number, step: number): number {
  return Math.max(0, Math.round((max - min) / step))
}

/**
 * Which ticks are worth drawing.
 *
 * A range of 0–10080 minutes at one-minute steps is ten thousand ticks, and
 * a browser asked to draw them all will say so. Only what fits on screen,
 * plus a margin so a drag never reaches an edge that has not been drawn yet.
 */
export function visibleTicks(
  centre: number,
  widthPx: number,
  pxPerStep: number,
  count: number,
  margin = 6,
): { from: number; to: number } {
  const half = widthPx / 2 / pxPerStep
  return {
    from: Math.max(0, Math.floor(centre - half) - margin),
    to: Math.min(count, Math.ceil(centre + half) + margin),
  }
}

/** Whether a tick gets a number under it, or is just a mark. */
export function isMajor(index: number, majorEvery: number): boolean {
  return majorEvery > 0 && index % majorEvery === 0
}

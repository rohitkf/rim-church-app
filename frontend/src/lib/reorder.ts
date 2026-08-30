/**
 * Moving one thing in a list, which is all a drag actually does.
 *
 * Kept apart from the pointer handling because the two fail in different
 * ways and only one of them can be reasoned about at a desk: this is the
 * half that says what the list becomes.
 */

/** `ids` with the item at `from` lifted out and put back down at `to`. */
export function moveItem<T>(ids: readonly T[], from: number, to: number): T[] {
  const next = [...ids]
  if (from < 0 || from >= next.length) return next
  const target = Math.min(Math.max(to, 0), next.length - 1)
  const [lifted] = next.splice(from, 1)
  next.splice(target, 0, lifted)
  return next
}

/** Whether a drag ended where it began — nothing to save. */
export function sameOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

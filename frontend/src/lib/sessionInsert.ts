/**
 * Where a newly added session belongs in the running order.
 *
 * A session is always created at the end — the order index is unique and
 * the start times cascade from the first session, so the end is the one
 * place an insert cannot collide with anything. Then the whole order is
 * handed back to the database to renumber. This works out what that order
 * should be.
 */
export function orderWithInsert(
  /** The running order as it was, before the new session existed. */
  ids: string[],
  /** The session somebody pressed "add below" on. */
  afterId: string,
  newId: string,
): string[] {
  const at = ids.indexOf(afterId)
  // An anchor that has vanished under somebody else's edit leaves the new
  // session at the end — which is where it already is, so this says so
  // rather than inventing a position for it.
  if (at === -1) return [...ids, newId]
  const next = [...ids]
  next.splice(at + 1, 0, newId)
  return next
}

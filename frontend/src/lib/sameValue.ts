/**
 * Whether two values are the same setting, whatever order an object's keys
 * came in. A Save bar compares what is on screen with what was read back,
 * and Postgres hands a jsonb object back with its keys in its own order
 * (shortest first), not the order they were written in — so comparing the
 * JSON text said a saved object still differed, and "Not saved yet" never
 * went. Arrays keep their order: there, order is the value.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    // undefined and a missing key are the same thing to a setting.
    return (a ?? null) === (b ?? null)
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => sameValue(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
  for (const k of keys) if (!sameValue(ao[k], bo[k])) return false
  return true
}

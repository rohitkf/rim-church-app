/**
 * Two letters from a name, for an avatar with no picture.
 *
 * Falls back to something visible rather than an empty circle: a blank
 * avatar reads as a loading state that never finishes.
 */
export function initialsOf(first?: string | null, last?: string | null): string {
  return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase() || '··'
}

/**
 * A `<select>` has no concept of null: its "none" option carries an empty
 * string, and an empty string sent to a uuid column is not "no department",
 * it is a syntax error. Anything that feeds a select's value into an id
 * column goes through here.
 */
export function idOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

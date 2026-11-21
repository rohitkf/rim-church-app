/**
 * A session's note (0316): one piece of text about the session for
 * everybody who reads the running order. "Communion follows, elements on
 * the table by 10:40."
 *
 * Not a comment (lib/sessionComments): that is a Pastor's word to whoever
 * runs the church, private, and never on the Preview or the sheet. A note
 * is part of the plan and goes wherever the session goes.
 */

/** The most a note runs to: what a card, and a row of the exported sheet, can carry and still be read. The database holds the same line. */
export const NOTE_MAX = 500

/**
 * What was typed, as it is kept: one run of text, no line breaks, nothing
 * either end, no longer than the most. Null when that leaves nothing —
 * which is how a note is taken off.
 */
export function tidyNote(typed: string | null | undefined): string | null {
  const text = (typed ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim()
  return text || null
}

/** The note a session carries, or null: a row read before 0316 has none. */
export const noteOf = (session: { note?: string | null }): string | null => tidyNote(session.note)

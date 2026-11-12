/*
 * A long list, a screen at a time.
 *
 * The Owner asked of the Events page (November 2026): "add lazy loading …
 * so that the page scrolling isn't so long. And that we load more events
 * when we press show more." The diary's "Coming up" was every birthday,
 * service and event for a year — about a hundred and ninety rows on the
 * day this was written.
 *
 * So a list starts with its first few and draws the rest only when asked.
 * Nothing more is fetched by asking: the diary is worked out from what the
 * page already holds. What is saved is the drawing, and the length of the
 * page.
 */

/** How many entries a list shows to begin with. */
export const FIRST_PAGE = 10
/** How many more each "Show more" brings. More than the first page: somebody asking has decided to read. */
export const NEXT_PAGE = 20

export interface Paged<T> {
  /** The days to draw. */
  shown: [string, T[]][]
  /** How many entries those days hold. */
  entries: number
  /** How many entries are still to come. */
  left: number
  /** The last day drawn, if any. */
  lastDay: string | null
}

/**
 * The first days of a list that is grouped by day, whole. Days are taken
 * in the order given until at least `count` entries are in; a day is never
 * cut in half — "Today" with three things on shows all three.
 */
export function firstDays<T>(days: [string, T[]][], count: number): Paged<T> {
  const total = days.reduce((n, [, entries]) => n + entries.length, 0)
  const shown: [string, T[]][] = []
  let entries = 0
  for (const day of days) {
    if (entries >= count) break
    shown.push(day)
    entries += day[1].length
  }
  return { shown, entries, left: total - entries, lastDay: shown.length ? shown[shown.length - 1][0] : null }
}

/** "178 more" / "1 more". */
export function moreWords(left: number): string {
  return `${left} more`
}

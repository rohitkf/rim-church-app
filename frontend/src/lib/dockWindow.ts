/**
 * Which destinations the phone dock shows, and where the window sits.
 *
 * The dock holds three on a phone and hides the rest behind More. It used
 * to hold the *first* three, and when you were somewhere further down the
 * list your destination took the last slot — so standing on Checklists
 * you saw Dashboard, Service Planner, Checklists, and nothing to the
 * right of you. The list went on for nine more, and the only way to any
 * of them was to open More and read a menu.
 *
 * So the window slides instead. It keeps the destination you are on with
 * a neighbour either side, which means moving right brings the next one
 * into view rather than leaving you at the end of a bar: the dock becomes
 * something you can walk along a step at a time, and More becomes what it
 * should have been all along — the way to jump, not the only way to move.
 *
 * At the ends it stops rather than wrapping. Being on Dashboard shows the
 * first three, not the last one and the first two: a list that scrolls
 * round has no beginning, and "the first thing" is a fact worth being
 * able to see.
 */

/**
 * The indices to show, in order.
 *
 * `active` may be -1 — a page that is not a destination, like Settings or
 * a team's own page — and the window then rests at the start, which is
 * where it would have been before anybody navigated.
 */
export function dockWindow(total: number, active: number, slots: number): number[] {
  if (total <= 0 || slots <= 0) return []
  const size = Math.min(slots, total)
  // One neighbour to the left of centre, so a window of three reads as
  // "where I came from, where I am, where I am going".
  const wanted = active < 0 ? 0 : active - Math.floor((size - 1) / 2)
  const start = Math.max(0, Math.min(wanted, total - size))
  return Array.from({ length: size }, (_, i) => start + i)
}

/**
 * How many destinations the bar itself carries on a phone.
 *
 * The rest go behind More. Three is what survives the widest label
 * ("Service Planner") being spelled out next to two icons and the More
 * button on a 360px screen, which is the narrowest phone worth designing
 * for.
 */
export const PHONE_SLOTS = 3

/** Below this the bar is a phone's: three, and More. Tailwind's `md`. */
const WIDE_FROM = 768
/** An icon and the gap after it. */
const SLOT = 44 + 6
/** The one destination wearing its name: icon, the longest label, its padding. */
const ACTIVE = 170
/** The screen's margin either side of the bar, and the bar's own padding. */
const CHROME = 24 + 20
/**
 * The assistant hanging off the end: a gap, its divider, a gap, and the
 * button, which wears its name ("Ask") and so is 84 wide, not an icon's 44.
 * Counting it as an icon left the current page's label 15px short at 1100.
 */
const TRAILING = 6 + 9 + 6 + 84

/**
 * How many destinations fit on the bar of a screen `width` pixels wide.
 *
 * Past a phone the bar used to carry every destination, each a fixed 44px,
 * with nothing to say what happened when they did not fit. With a dozen
 * that never came up. An Owner now has two dozen, which is 1,400px of
 * icons: on a tablet or a laptop the row ran off the right of the screen
 * and the last destinations were simply not there.
 *
 * So the bar carries what it has room for and More carries the rest, at
 * every width. Where everything fits there is no More at all, which is
 * what a wide screen has always looked like.
 */
export function dockSlots(width: number, total: number, hasTrailing = false): number {
  if (total <= 0) return 0
  if (width < WIDE_FROM) return Math.min(PHONE_SLOTS, total)
  const room = width - CHROME - (hasTrailing ? TRAILING : 0)
  if (ACTIVE + (total - 1) * SLOT <= room) return total
  // Not everything fits, so More takes a slot of its own.
  const fit = Math.floor((room - ACTIVE - SLOT) / SLOT) + 1
  return Math.max(Math.min(PHONE_SLOTS, total), Math.min(total - 1, fit))
}

/**
 * Whether the bar needs its More button.
 *
 * When some destinations are not on the bar, always. And on a phone
 * whenever the assistant is there: a phone's bar has no room for it, so
 * More's sheet is the only place it lives, even for somebody whose three
 * pages all fit.
 */
export function dockHasMore(width: number, total: number, hasTrailing = false): boolean {
  return dockSlots(width, total, hasTrailing) < total || (hasTrailing && width < WIDE_FROM)
}

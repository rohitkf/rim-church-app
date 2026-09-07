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

/**
 * Availability, the rota and the checklists are one job done in order.
 *
 * You say whether you can serve; a head builds the rota out of those
 * answers; and only somebody the rota put on has a checklist to tick. Three
 * pages in the menu made that look like three unrelated things, so they
 * are one destination now — Serving — with a tab for each step.
 *
 * Each tab keeps its own address. A notification that says "your team is
 * waiting on you" still lands on /availability, a link to the rota is
 * still /rota, and each page keeps its own rule in Settings › Access &
 * privileges, because the three are not open to the same people: the
 * rota can be opened to Church Members, the other two need a team.
 */
export const SERVING_PATH = '/serving'

export const SERVING_TABS: { to: string; label: string; hint: string }[] = [
  { to: '/availability', label: 'Availability', hint: 'Who can serve' },
  { to: '/rota', label: 'Team Rota', hint: 'Who is on' },
  { to: '/checklists', label: 'Checklists', hint: 'What to do on the day' },
]

/** Whether this address is one of the Serving tabs (or somewhere inside one). */
export function isServingPath(pathname: string): boolean {
  return (
    pathname === SERVING_PATH ||
    SERVING_TABS.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))
  )
}

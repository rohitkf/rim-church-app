import { reachOf, type CapabilityKey, type Overrides } from './permissions'
import { ruleFor } from './pageAccess'

/**
 * Overwatch (0187): sees every team, changes almost nothing.
 *
 * The database holds both halves — `overwatch_sees` and `overwatch_may` —
 * and this only decides what to draw. A page's key is its route without
 * the slash, the same key `can_open_page` is asked with; the dashboard is
 * always open, because it is where everybody lands.
 */

/** The pages the church can open or close to Overwatch, in the menu's words. */
export const OVERWATCH_PAGE_DEFAULT_CLOSED = ['volunteers'] as const

export function overwatchPageKey(path: string): string | null {
  const found = ruleFor(path)
  const root = found ? found.path : `/${path.split('/')[1] ?? ''}`
  if (root === '/' || root === '') return null
  return root.replace(/^\//, '')
}

/** Whether Overwatch may open this page under the church's choices. */
export function overwatchOpens(path: string, pages: Record<string, boolean>): boolean {
  const key = overwatchPageKey(path)
  if (!key) return true
  if (pages && key in pages) return pages[key]
  return !(OVERWATCH_PAGE_DEFAULT_CLOSED as readonly string[]).includes(key)
}

export type OverwatchAct = 'board' | 'chat' | 'polls' | 'issues' | 'debriefs'

/**
 * Each of the five things Overwatch may do is its cell in the grid (0214)
 * — Settings › Access & Privileges, Overwatch's column — on the row it is
 * about, and the page it needs open. `overwatch_may()` reads the same.
 */
export const OVERWATCH_ACTS: Record<OverwatchAct, { capability: CapabilityKey; page: string }> = {
  board: { capability: 'msg.board_post', page: '/messages' },
  chat: { capability: 'msg.chat', page: '/team-chat' },
  polls: { capability: 'msg.polls', page: '/polls' },
  issues: { capability: 'issue.as_overwatch', page: '/issues' },
  debriefs: { capability: 'debrief.as_overwatch', page: '/debriefs' },
}

/** Which of the five a capability is, if it is one. */
export function overwatchActOf(cap: CapabilityKey): OverwatchAct | null {
  const found = (Object.keys(OVERWATCH_ACTS) as OverwatchAct[]).find((act) => OVERWATCH_ACTS[act].capability === cap)
  return found ?? null
}

/** One of the five things Overwatch may do: its cell at Everywhere, on a page open to it. */
export function overwatchMay(overrides: Overrides, pages: Record<string, boolean>, act: OverwatchAct): boolean {
  const { capability, page } = OVERWATCH_ACTS[act]
  return reachOf(overrides, capability, 'overwatch') !== 'none' && overwatchOpens(page, pages)
}

/**
 * Rows of the grid whose answer Overwatch has without a cell of its own:
 * it reads them through its pages (`overwatch_sees`), not through may(),
 * so the church opens or closes them in Settings › Overwatch.
 */
export const OVERWATCH_READS: Partial<Record<CapabilityKey, string>> = {
  'clockin.view': '/clock-in',
  'avail.history': '/availability',
}

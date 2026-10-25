import type { AppSettings } from './appSettings'
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

const SWITCH: Record<OverwatchAct, { column: keyof AppSettings; page: string }> = {
  board: { column: 'overwatch_board_posts', page: '/messages' },
  chat: { column: 'overwatch_chat_posts', page: '/team-chat' },
  polls: { column: 'overwatch_polls', page: '/polls' },
  issues: { column: 'overwatch_issues', page: '/issues' },
  debriefs: { column: 'overwatch_debriefs', page: '/debriefs' },
}

/** One of the five things Overwatch may do: switched on, on a page open to it. */
export function overwatchMay(settings: AppSettings, act: OverwatchAct): boolean {
  const { column, page } = SWITCH[act]
  return settings[column] === true && overwatchOpens(page, settings.overwatch_pages)
}

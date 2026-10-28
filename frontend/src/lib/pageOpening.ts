import type { AppSettings } from './appSettings'
import { levelOf, standingMayOpen, type AccessLevel, type PageAccess, type Standing } from './pageAccess'
import { overwatchOpens } from './overwatch'
import { maySeeClockIns, type ClockInAudience } from './clockIn'

/** Who is asking, for the purpose of opening pages. */
export interface PageWho {
  myId: string | null | undefined
  /** As pageAccess's standingOf() works it out. */
  standing: Standing
  isAdmin: boolean
  isOwner: boolean
  isOverwatch: boolean
  isPastor: boolean
  /** Teams they are on or lead. */
  teamIds: readonly string[]
  /** The grid's answer for `clockin.view` (0209): a profile given it, or a grant. */
  clockInViewer: boolean
}

/** Named, or on a team named, in one of the rooms' lists. */
function inList(who: PageWho, list: ClockInAudience): boolean {
  if (who.myId && list.people.includes(who.myId)) return true
  return who.teamIds.some((id) => list.teams.includes(id))
}

/** Why a page opens to somebody, or what it waits for when it does not. */
export type PageOpening =
  | { open: true; via: 'level'; level: AccessLevel }
  /** Settings › Overwatch left it open to them. */
  | { open: true; via: 'overwatch'; level: AccessLevel }
  /** Given `clockin.view`: in the grid, or by a grant (0209). */
  | { open: true; via: 'clock-in'; level: AccessLevel }
  /** A pastor: the Pastor role, the Owner, or named in Settings › Prayer. */
  | { open: true; via: 'pastoral'; level: AccessLevel }
  | { open: false; level: AccessLevel }

/**
 * Whether this person may open this page, and why — the one answer the
 * menu (usePageAccess) and Settings › Access › By person both read.
 */
export function pageOpening(path: string, who: PageWho, settings: AppSettings): PageOpening {
  const level = levelOf(path, settings.page_access as PageAccess, settings.issues_raise_scope)
  if (standingMayOpen(who.standing, level)) return { open: true, via: 'level', level }
  // Overwatch opens what the church left open to it (Settings ›
  // Overwatch, 0187), and whatever its own teams would open besides.
  if (who.isOverwatch && overwatchOpens(path, settings.overwatch_pages)) return { open: true, via: 'overwatch', level }
  // Clock In is also open to whoever the grid gives `clockin.view` (0209):
  // a profile the church said yes for, or a grant by name or through a
  // team — not a level.
  if (
    path === '/clock-in' &&
    maySeeClockIns({ isAdmin: who.isAdmin, isOwner: who.isOwner, watching: false, granted: who.clockInViewer })
  ) {
    return { open: true, via: 'clock-in', level }
  }
  // Prayer Requests is always open to the pastors — the Pastor role, the
  // Owner, and whoever Settings › Prayer adds (0197) — whatever level
  // Page by page sets for everybody else.
  if (path === '/prayer' && (who.isOwner || who.isPastor || inList(who, settings.prayer_carers))) {
    return { open: true, via: 'pastoral', level }
  }
  return { open: false, level }
}

import type { AppSettings } from './appSettings'
import { levelOf, standingMayOpen, type AccessLevel, type PageAccess, type Standing } from './pageAccess'
import { overwatchOpens } from './overwatch'
import { maySeeClockIns } from './clockIn'

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
}

/** Why a page opens to somebody, or what it waits for when it does not. */
export type PageOpening =
  | { open: true; via: 'level'; level: AccessLevel }
  /** Settings › Overwatch left it open to them. */
  | { open: true; via: 'overwatch'; level: AccessLevel }
  /** Named, or on a team named, in Settings › Clock in. */
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
  // Clock In is also open to the people and teams the church named for
  // it (Settings › Clock in, 0191) — a list, not a level.
  if (
    path === '/clock-in' &&
    maySeeClockIns({
      isAdmin: who.isAdmin,
      isOwner: who.isOwner,
      watching: false,
      myId: who.myId,
      teamIds: who.teamIds,
      viewers: settings.clock_in_viewers,
    })
  ) {
    return { open: true, via: 'clock-in', level }
  }
  // Prayer Requests is always open to the pastors — the Pastor role, the
  // Owner, and whoever Settings › Prayer adds (0197) — whatever level
  // Page by page sets for everybody else.
  if (
    path === '/prayer' &&
    maySeeClockIns({
      isAdmin: false,
      isOwner: who.isOwner || who.isPastor,
      watching: false,
      myId: who.myId,
      teamIds: who.teamIds,
      viewers: settings.prayer_carers,
    })
  ) {
    return { open: true, via: 'pastoral', level }
  }
  return { open: false, level }
}

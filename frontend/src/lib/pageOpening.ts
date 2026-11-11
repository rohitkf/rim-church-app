import type { AppSettings } from './appSettings'
import { levelOf, standingMayOpen, type AccessLevel, type PageAccess, type Standing } from './pageAccess'
import { overwatchOpens } from './overwatch'
import { maySeeClockIns } from './clockIn'
import { pageCapability } from './pageCells'
import type { CapabilityKey } from './permissions'

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
  /** The grid's answer for `prayer.pastoral` (0210). */
  prayerCarer: boolean
  /** The grid's answer for `reg.manage` (0244): a profile given it, or a grant. */
  regManager?: boolean
  /** The grid's answer for `reg.door` (0247). */
  doorWorker?: boolean
  /**
   * The grid's answer for a page's own capability (0215), grants
   * included — what opens a page to somebody its level does not.
   */
  opens?: (cap: CapabilityKey) => boolean
}

/** Why a page opens to somebody, or what it waits for when it does not. */
export type PageOpening =
  | { open: true; via: 'level'; level: AccessLevel }
  /** Settings › Overwatch left it open to them. */
  | { open: true; via: 'overwatch'; level: AccessLevel }
  /** Given `clockin.view`: in the grid, or by a grant (0209). */
  | { open: true; via: 'clock-in'; level: AccessLevel }
  /** A pastor: the Pastor role, the Owner, or given `prayer.pastoral` (0210). */
  | { open: true; via: 'pastoral'; level: AccessLevel }
  /** The Owner, or given `reg.manage` (0244). */
  | { open: true; via: 'registrations'; level: AccessLevel }
  /** The Owner, or given `reg.manage` or `reg.door` (0247). */
  | { open: true; via: 'door'; level: AccessLevel }
  /** Given the page itself, by name or through a team (0215). */
  | { open: true; via: 'grant'; level: AccessLevel }
  | { open: false; level: AccessLevel }

/**
 * Whether this person may open this page, and why — the one answer the
 * menu (usePageAccess) and Settings › Access › By person both read.
 * `levels` is every page's level, as the grid has it (usePageLevels).
 */
export function pageOpening(path: string, who: PageWho, settings: AppSettings, levels: PageAccess): PageOpening {
  const level = levelOf(path, levels, settings.issues_raise_scope)
  // Registrations (0244) opens to the Owner and to whoever the grid gives
  // `reg.manage` — never by level, so an Admin needs the cell as well.
  if (path === '/registrations' || path.startsWith('/registrations/')) {
    return who.isOwner || !!who.regManager ? { open: true, via: 'registrations', level } : { open: false, level }
  }
  // The Countdown (0264): whoever the grid gives "See the Countdown" — a
  // role's cell, or a grant to a team or a person — and the Owner. Never
  // by level, so an Admin the church said no for does not see it.
  if (path === '/countdown') {
    return who.isOwner || !!who.opens?.('countdown.view') ? { open: true, via: 'grant', level } : { open: false, level }
  }
  // Feedback (0277): whoever the grid lets send it — anybody on a team out
  // of the box — and whoever reads everybody's. Asked by standing only
  // where the caller brought no grid to ask.
  if (path === '/feedback') {
    if (who.opens) {
      return who.isOwner || who.opens('feedback.send') || who.opens('feedback.manage')
        ? { open: true, via: standingMayOpen(who.standing, level) ? 'level' : 'grant', level }
        : { open: false, level }
    }
    return standingMayOpen(who.standing, level) ? { open: true, via: 'level', level } : { open: false, level }
  }
  // Reception (0247): the same people, and whoever works the door.
  if (path === '/door') {
    return who.isOwner || !!who.regManager || !!who.doorWorker ? { open: true, via: 'door', level } : { open: false, level }
  }
  // Clock In (0209) opens to whoever the grid gives `clockin.view` — a
  // profile the church said yes for, an Admin's cell included since 0275,
  // or a grant — and to Overwatch where its room leaves it open. Never by
  // level, so an Admin the church said no for does not see it.
  if (path === '/clock-in' || path.startsWith('/clock-in/')) {
    if (maySeeClockIns({ isOwner: who.isOwner, watching: false, granted: who.clockInViewer })) {
      return { open: true, via: standingMayOpen(who.standing, level) ? 'level' : 'clock-in', level }
    }
    return who.isOverwatch && overwatchOpens(path, settings.overwatch_pages)
      ? { open: true, via: 'overwatch', level }
      : { open: false, level }
  }
  // A page in the grid (0215) opens by the grid's own answer — the same
  // may() can_open_page asks — so a cell closed to Heads or to Admins
  // (0274) closes it for them, and a grant by name or through a team opens
  // it whatever its level. Asked by standing only where there is no grid
  // answer to ask: a page with no cells, or a caller that brought none.
  const cap = pageCapability(path)
  if (cap && who.opens) {
    if (who.isOwner || who.opens(cap)) {
      return { open: true, via: standingMayOpen(who.standing, level) ? 'level' : 'grant', level }
    }
  } else if (standingMayOpen(who.standing, level)) {
    return { open: true, via: 'level', level }
  }
  // Overwatch opens what the church left open to it (Settings ›
  // Overwatch, 0187), and whatever its own teams would open besides.
  if (who.isOverwatch && overwatchOpens(path, settings.overwatch_pages)) return { open: true, via: 'overwatch', level }
  // Prayer Requests is always open to the pastors — the Pastor role, the
  // Owner, and whoever Settings › Prayer adds (0197) — whatever level
  // Page by page sets for everybody else.
  if (path === '/prayer' && (who.isOwner || who.isPastor || who.prayerCarer)) {
    return { open: true, via: 'pastoral', level }
  }
  return { open: false, level }
}

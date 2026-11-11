import { PAGE_RULES } from './pageAccess'
import { pageCapability } from './pageCells'
import { PERMISSIONS, type PermissionArea } from './permissionMatrix'
import { isFixed, reachOf, type CapabilityKey, type GridRole, type Overrides, type PermissionChange } from './permissions'
import { pageName } from './settingsCatalog'

/*
 * A right somebody cannot reach.
 *
 * Giving a role something to do does not open the page it is done on: a
 * Pastor given "Assign somebody to a role" still cannot open the Team
 * Rota. The right is real — the database honours it — but no button
 * appears, and the Owner asked not to be left with settings that look as
 * if they worked (November 2026). So when a change about to be saved
 * gives a role a right whose page is closed to it, the grid says so, and
 * offers to open the page in the same save where a cell can do that.
 *
 * Only the three roles a page can be closed to are asked: a Church Member
 * (everybody signed in), a Team Member and a Pastor. Admins and Heads open
 * every page, a Team Coordinator is on a team, and what Overwatch opens is
 * its own room's.
 */

export interface PageNeed {
  role: GridRole
  /** The right being given. */
  capability: CapabilityKey
  /** The page it lives on, as a route, and as the menu names it. */
  page: string
  pageName: string
  /** The cell that would open the page for this role, when one can; null when the page is fixed. */
  opener: CapabilityKey | null
}

const ASKED: readonly GridRole[] = ['newcomer', 'member', 'pastor']

/** Whether a page is open to somebody who holds only this role, as the grid stands. */
function opensTo(path: string, role: GridRole, grid: Overrides): boolean {
  const cap = pageCapability(path)
  const on = (c: CapabilityKey, r: GridRole) => reachOf(grid, c, r) !== 'none'
  if (cap) {
    if (on(cap, 'newcomer')) return true
    if (role === 'member') return on(cap, 'member')
    if (role === 'pastor') return cap === 'page.prayer' || on(cap, 'pastor')
    return false
  }
  // Clock In opens by "See every clock-in"; Registrations, Reception and the
  // Countdown open by their own rights, which is the right being given.
  if (path === '/clock-in') return on('clockin.view', role)
  if (path === '/registrations' || path === '/door' || path === '/countdown') return true
  const rule = PAGE_RULES[path]
  if (!rule) return true
  if (rule.default === 'everyone') return true
  if (rule.default === 'team') return role === 'member'
  return false
}

/** The cell that would open a page for a role, if the grid has one to set. */
function openerFor(path: string, role: GridRole): CapabilityKey | null {
  const cap = path === '/clock-in' ? ('clockin.view' as CapabilityKey) : pageCapability(path)
  return cap && !isFixed(cap, role) ? cap : null
}

/**
 * The rights these changes give that their role could not reach, one per
 * role and page. `grid` is the grid as it would be once saved.
 */
export function pageNeeds(changes: readonly PermissionChange[], grid: Overrides, areas: readonly PermissionArea[] = PERMISSIONS): PageNeed[] {
  const out: PageNeed[] = []
  for (const change of changes) {
    if (change.department || !change.reach || change.reach === 'none') continue
    if (!ASKED.includes(change.role) || change.capability.startsWith('page.')) continue
    const area = areas.find((a) => a.capabilities.some((c) => c.key === change.capability))
    const row = area?.capabilities.find((c) => c.key === change.capability)
    const pages = (row?.at ?? area?.pages ?? []).filter((ref) => ref.startsWith('/'))
    if (pages.length === 0 || pages.some((path) => opensTo(path, change.role, grid))) continue
    // The page to open: one the grid can open, if there is one.
    const page = pages.find((path) => openerFor(path, change.role)) ?? pages[0]
    if (out.some((n) => n.role === change.role && n.page === page)) continue
    out.push({ role: change.role, capability: change.capability, page, pageName: pageName(page), opener: openerFor(page, change.role) })
  }
  return out
}

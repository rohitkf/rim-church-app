import { PAGE_RULES, ruleFor, type AccessLevel, type PageAccess } from './pageAccess'
import { isCapabilityKey, isFixed, reachOf, type CapabilityKey, type GridRole, type Overrides, type Reach } from './permissions'

/**
 * Who may open a page, as cells in the grid (0215).
 *
 * Each page with a choice in Settings › Page by Page is a capability,
 * `page.<key>` (a hyphen in the key becomes an underscore), whose two
 * changeable cells — a Team Member's and a Church Member's — say its
 * level. Every pair of them is one of the levels, so Page by Page still
 * offers levels, and this turns one into the other. `can_open_page()`
 * asks `may()` for these pages, so a grant opens one too.
 */

/** The capability that opens a page, from its key or any path under it. */
export function pageCapability(pathOrKey: string): CapabilityKey | null {
  const key = pathOrKey.startsWith('/') ? ruleFor(pathOrKey)?.rule.key : pathOrKey
  if (!key) return null
  const cap = `page.${key.replace(/-/g, '_')}`
  return isCapabilityKey(cap) ? cap : null
}

/** Every page with a choice, and its capability. */
export const PAGE_CAPABILITIES: { path: string; key: string; capability: CapabilityKey }[] = Object.entries(PAGE_RULES).flatMap(
  ([path, rule]) => {
    const capability = rule.key ? pageCapability(rule.key) : null
    return rule.key && capability ? [{ path, key: rule.key, capability }] : []
  },
)

/** Whether this capability is one that opens a page. */
export function isPageCapability(cap: CapabilityKey): boolean {
  return PAGE_CAPABILITIES.some((p) => p.capability === cap)
}

/**
 * One page's level, as its cells say it: the widest profile it is open to
 * — Church Members, then Team Members, then Heads, then Admins (0274),
 * else the Owner alone.
 */
export function levelFromCells(overrides: Overrides, cap: CapabilityKey): AccessLevel {
  if (reachOf(overrides, cap, 'newcomer') === 'all') return 'everyone'
  if (reachOf(overrides, cap, 'member') === 'all') return 'team'
  if (reachOf(overrides, cap, 'head') === 'all' || reachOf(overrides, cap, 'assistant') === 'all') return 'leads'
  if (reachOf(overrides, cap, 'admin') === 'all') return 'admins'
  return 'owner'
}

/** Every page's level, as the grid has it — what `app_settings.page_access` said until 0215. */
export function levelsFrom(overrides: Overrides): PageAccess {
  return Object.fromEntries(PAGE_CAPABILITIES.map(({ key, capability }) => [key, levelFromCells(overrides, capability)]))
}

/** The cells that set a page to a level: only the ones the page lets the church change. */
export function cellsForLevel(cap: CapabilityKey, level: AccessLevel): { role: GridRole; reach: Reach }[] {
  const wanted: { role: GridRole; reach: Reach }[] = [
    { role: 'newcomer', reach: level === 'everyone' ? 'all' : 'none' },
    { role: 'member', reach: level === 'everyone' || level === 'team' ? 'all' : 'none' },
    // A level is the whole ladder (0274): choosing one sets every rung, so
    // a page opened again is opened to its Heads and Admins too.
    { role: 'head', reach: level === 'admins' || level === 'owner' ? 'none' : 'all' },
    { role: 'assistant', reach: level === 'admins' || level === 'owner' ? 'none' : 'all' },
    { role: 'admin', reach: level === 'owner' ? 'none' : 'all' },
  ]
  return wanted.filter(({ role }) => !isFixed(cap, role))
}

/**
 * Prayer Requests opens to the Pastors whatever its level (pageOpening):
 * not a cell of theirs, so can_open_page() answers for them as before.
 */
export const PASTORS_OPEN: CapabilityKey = 'page.prayer'

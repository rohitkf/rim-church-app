/**
 * Who may open each page — the church's choice, within what the database
 * can honour.
 *
 * Four profiles, from widest to narrowest. Each page is set to the lowest
 * one that may open it; Admins (and the Owner) always may, because an
 * Admin is how a wrong setting gets put right.
 *
 * PAGE_RULES is mirrored by `page_access_is_valid()` and `page_level()` in
 * migration 0123. The two must agree: a choice offered here that SQL
 * refuses is a Save that fails; a choice SQL allows that this does not
 * offer is a setting nobody can reach. `pageAccess.test.ts` reads the
 * migration and checks.
 */

export type AccessLevel = 'everyone' | 'team' | 'leads' | 'admins'

/** Who somebody is, for the purpose of opening pages. */
export type Standing = 'church' | 'member' | 'lead' | 'admin'

export const ACCESS_LEVELS: { value: AccessLevel; label: string; short: string }[] = [
  { value: 'everyone', label: 'Everyone signed in', short: 'Everyone' },
  { value: 'team', label: 'Anyone on a team', short: 'Teams' },
  { value: 'leads', label: 'Team Heads and Admins', short: 'Heads' },
  { value: 'admins', label: 'Admins only', short: 'Admins' },
]

export const STANDINGS: { value: Standing; label: string; blurb: string }[] = [
  { value: 'church', label: 'Church Member', blurb: 'Signed in, on no team yet.' },
  { value: 'member', label: 'Team Member', blurb: 'On at least one team.' },
  { value: 'lead', label: 'Team Head', blurb: 'Head or Assisting Head of a team.' },
  { value: 'admin', label: 'Admin', blurb: 'Everything, everywhere. Always.' },
]

/**
 * What a setting can actually do to a page.
 *
 * `database` — the rows themselves follow the choice: a profile the page
 *   is closed to gets nothing back from the API either.
 * `widen` — the database follows a wider choice; the page's rows are also
 *   read by other team pages, so the teams always keep them.
 * `page` — only the page is hidden; what it shows is on other pages too.
 * `fixed` — not a choice; the reason says why.
 */
export type Enforcement = 'database' | 'widen' | 'page' | 'fixed'

export interface PageRule {
  /** The key in app_settings.page_access, when it has one. */
  key?: string
  default: AccessLevel
  choices: AccessLevel[]
  enforcement: Enforcement
  /** Said beside the control: what the choice does, or why there is none. */
  note: string
}

export const PAGE_RULES: Record<string, PageRule> = {
  '/': {
    default: 'everyone',
    choices: ['everyone'],
    enforcement: 'fixed',
    note: 'Where everybody lands. What is on it follows the other pages.',
  },
  '/service-planner': {
    key: 'service-planner',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads'],
    enforcement: 'page',
    note: 'Hides the page. The services themselves still show on the Dashboard.',
  },
  '/availability': {
    default: 'team',
    choices: ['team'],
    enforcement: 'fixed',
    note: 'You answer for a team, so it needs one.',
  },
  '/rota': {
    key: 'rota',
    default: 'team',
    choices: ['everyone', 'team'],
    enforcement: 'widen',
    note: 'Opening it lets Church Members read who is serving. Teams always keep it — Availability and Checklists read the same rows.',
  },
  '/checklists': {
    default: 'team',
    choices: ['team'],
    enforcement: 'fixed',
    note: 'Ticked by whoever the rota put on, so it needs a team.',
  },
  '/set-lists': {
    key: 'set-lists',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads'],
    enforcement: 'page',
    note: 'Hides the page.',
  },
  '/debriefs': {
    key: 'debriefs',
    default: 'team',
    choices: ['team', 'leads'],
    enforcement: 'database',
    note: 'Heads only keeps a team’s minutes to its leaders.',
  },
  '/issues': {
    default: 'team',
    choices: ['team'],
    enforcement: 'fixed',
    note: 'Follows “Who can raise one” in Timings — Everyone signed in opens it to Church Members too.',
  },
  '/messages': {
    key: 'messages',
    default: 'team',
    choices: ['everyone', 'team', 'leads'],
    enforcement: 'database',
    note: 'The whole board follows the choice.',
  },
  '/team-chat': {
    default: 'team',
    choices: ['team'],
    enforcement: 'fixed',
    note: 'Each team’s own room, so it needs a team.',
  },
  '/updates': {
    key: 'updates',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads'],
    enforcement: 'database',
    note: 'Updates follow the choice.',
  },
  '/polls': {
    key: 'polls',
    default: 'everyone',
    choices: ['everyone', 'team'],
    enforcement: 'database',
    note: 'Still only the polls addressed to each person.',
  },
  '/events': {
    key: 'events',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads'],
    enforcement: 'database',
    note: 'The diary follows the choice, Dashboard included.',
  },
  '/giving': {
    key: 'giving',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads'],
    enforcement: 'database',
    note: 'Links and bank details follow the choice.',
  },
  '/departments': {
    key: 'departments',
    default: 'everyone',
    choices: ['everyone', 'team'],
    enforcement: 'page',
    note: 'Church Members ask to join a team from here — closing it closes that door.',
  },
  '/volunteers': {
    default: 'admins',
    choices: ['admins'],
    enforcement: 'fixed',
    note: 'Roles and safeguarding details are an Admin’s.',
  },
  '/feedback': {
    default: 'team',
    choices: ['team'],
    enforcement: 'fixed',
    note: 'Anybody on a team can send feedback; only Admins read everybody’s.',
  },
  '/inventory': {
    key: 'inventory',
    default: 'team',
    choices: ['team', 'leads'],
    enforcement: 'database',
    note: 'The registers follow the choice.',
  },
}

export type PageAccess = Partial<Record<string, AccessLevel>>

const RANK: Record<Standing, number> = { church: 0, member: 1, lead: 2, admin: 3 }
const NEEDS: Record<AccessLevel, number> = { everyone: 0, team: 1, leads: 2, admins: 3 }

/** The rule a path is governed by: its own, or the page it sits under. */
export function ruleFor(path: string): { path: string; rule: PageRule } | null {
  const match = Object.keys(PAGE_RULES)
    .filter((p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0]
  return match ? { path: match, rule: PAGE_RULES[match] } : null
}

/** The level a page is set to — the church's choice if it is a valid one, its default if not. */
export function levelOf(path: string, access: PageAccess, issuesScope?: string): AccessLevel {
  const found = ruleFor(path)
  if (!found) return 'everyone'
  if (found.path === '/issues') return issuesScope === 'everyone' ? 'everyone' : 'team'
  const chosen = found.rule.key ? access[found.rule.key] : undefined
  return chosen && found.rule.choices.includes(chosen) ? chosen : found.rule.default
}

export function standingMayOpen(standing: Standing, level: AccessLevel): boolean {
  return RANK[standing] >= NEEDS[level]
}

export function standingOf(who: { isAdmin: boolean; isLead: boolean; onATeam: boolean }): Standing {
  if (who.isAdmin) return 'admin'
  if (who.isLead) return 'lead'
  if (who.onATeam) return 'member'
  return 'church'
}

/** Whether this standing may open this path, under this church's choices. */
export function mayOpen(
  path: string,
  standing: Standing,
  access: PageAccess,
  issuesScope?: string,
): boolean {
  return standingMayOpen(standing, levelOf(path, access, issuesScope))
}

/**
 * What to save: only the keys that differ from their page's default, so
 * the row says what the church changed rather than restating the app.
 */
export function compactAccess(access: PageAccess): PageAccess {
  const out: PageAccess = {}
  for (const rule of Object.values(PAGE_RULES)) {
    if (!rule.key) continue
    const chosen = access[rule.key]
    if (chosen && chosen !== rule.default && rule.choices.includes(chosen)) out[rule.key] = chosen
  }
  return out
}

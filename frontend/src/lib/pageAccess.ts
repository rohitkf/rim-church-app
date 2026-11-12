/**
 * Who may open each page — the church's choice, within what the database
 * can honour.
 *
 * Four profiles, from widest to narrowest. Each page is set to the lowest
 * one that may open it; Admins (and the Owner) always may, because an
 * Admin is how a wrong setting gets put right.
 *
 * PAGE_RULES is mirrored by `page_access_is_valid()` and `page_level()` in
 * migration 0123, and — since a page's level became two cells in the grid
 * (0215) — by its `page.<key>` cells in lib/permissions.ts and the
 * catalog. They must agree: a choice offered here that SQL refuses is a
 * Save that fails; a choice SQL allows that this does not offer is a
 * setting nobody can reach. `pageAccess.test.ts` and `pageCells.test.ts`
 * check.
 */

import { ROLE_NAME } from './roleNames'

export type AccessLevel = 'everyone' | 'team' | 'leads' | 'admins' | 'owner'

/** Who somebody is, for the purpose of opening pages. */
export type Standing = 'church' | 'member' | 'lead' | 'admin'

export const ACCESS_LEVELS: { value: AccessLevel; label: string; short: string }[] = [
  { value: 'everyone', label: 'Everyone signed in', short: 'Everyone' },
  { value: 'team', label: 'Anyone on a team', short: 'Teams' },
  { value: 'leads', label: 'Team Heads and Admins', short: 'Heads' },
  { value: 'admins', label: 'Admins only', short: 'Admins' },
  // Closed to the Admins too (0274): the Owner alone, and whoever is given the page by name.
  { value: 'owner', label: 'The Owner only', short: 'Owner' },
]

export const STANDINGS: { value: Standing; label: string; blurb: string }[] = [
  { value: 'church', label: ROLE_NAME.newcomer, blurb: 'Signed in, on no team yet.' },
  { value: 'member', label: ROLE_NAME.member, blurb: 'On at least one team.' },
  { value: 'lead', label: ROLE_NAME.head, blurb: 'Head or Assisting Head of a team.' },
  { value: 'admin', label: ROLE_NAME.admin, blurb: 'Everything, everywhere. Always.' },
]

/**
 * What a setting can actually do to a page.
 *
 * `database` — the rows themselves follow the choice: a profile the page
 *   is closed to gets nothing back from the API either.
 * `widen` — the database follows a wider choice; the page's rows are also
 *   read by other team pages, so the teams always keep them.
 * `page` — only the page is hidden; what it shows is on other pages too.
 * `permission` — the page opens by a row of its own in Access &
 *   Privileges rather than by a level: each role yes or no, and teams or
 *   people by name. `by` names the rows.
 * `follows` — the page follows another of the church's choices, said in
 *   the note.
 * `fixed` — not a choice; the reason says why. Only the Dashboard.
 */
export type Enforcement = 'database' | 'widen' | 'page' | 'permission' | 'follows' | 'fixed'

export interface PageRule {
  /** The page's key, when it has a choice: its capability is `page.<key>` (0215). */
  key?: string
  default: AccessLevel
  choices: AccessLevel[]
  enforcement: Enforcement
  /** The rows in Access & Privileges that open the page, when it opens by permission. */
  by?: readonly string[]
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
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Hides the page. The services themselves still show on the Dashboard.',
  },
  '/countdown': {
    // Not a level: its own row, "See the Countdown" (countdown.view, 0264),
    // so each role is a choice and a team or a person can be given it.
    default: 'admins',
    choices: ['admins'],
    enforcement: 'permission',
    by: ['countdown.view'],
    note: 'Whoever Access & Privileges gives “See the Countdown” — each role yes or no, and teams or people by name — and the Owner. Hides the page only.',
  },
  '/availability': {
    key: 'availability',
    default: 'team',
    choices: ['team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Hides the page. You answer for a team, so it is never a Church Member’s; kept to Heads, a team’s members are no longer asked here.',
  },
  '/rota': {
    key: 'rota',
    default: 'team',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'widen',
    note: 'Opening it lets Church Members read who is serving. Narrower than teams only hides the page: Availability and Checklists read the same rows.',
  },
  '/checklists': {
    key: 'checklists',
    default: 'team',
    choices: ['team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Hides the page. Ticked by whoever the rota put on, so it is never a Church Member’s.',
  },
  '/set-lists': {
    key: 'set-lists',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Hides the page.',
  },
  '/songs': {
    key: 'songs',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Hides the page. Who may add to the library is chosen under Songs.',
  },
  '/debriefs': {
    key: 'debriefs',
    default: 'team',
    choices: ['team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'Heads only keeps a team’s minutes to its leaders.',
  },
  '/issues': {
    default: 'team',
    choices: ['team'],
    enforcement: 'follows',
    note: 'Follows “Who can raise one”, under Issues in Page by Page — Everyone signed in opens it to Church Members too.',
  },
  '/messages': {
    key: 'messages',
    default: 'team',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'The whole board follows the choice.',
  },
  '/team-chat': {
    key: 'team-chat',
    default: 'team',
    choices: ['team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Hides the page. Each team’s own room, so it is never a Church Member’s.',
  },
  '/updates': {
    key: 'updates',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'Updates follow the choice.',
  },
  '/polls': {
    key: 'polls',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'Still only the polls addressed to each person.',
  },
  '/events': {
    key: 'events',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'The diary follows the choice, Dashboard included.',
  },
  '/giving': {
    key: 'giving',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'Links and bank details follow the choice.',
  },
  '/departments': {
    key: 'departments',
    // For people on a team (0189): a Church Member is added by a head
    // rather than asking their way in.
    default: 'team',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Opened to everyone, Church Members can ask to join a team from here. Out of the box a head adds them instead — the database refuses the request too.',
  },
  '/prayer': {
    key: 'prayer',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'Private requests are only ever the pastors’, whatever this says — and the pastors always open the page.',
  },
  '/clock-in': {
    default: 'admins',
    choices: ['admins'],
    enforcement: 'permission',
    by: ['clockin.view'],
    note: 'The Owner, Overwatch, and whoever “See the Clock In page” says in Access & Privileges — Admins out of the box — with the people and teams named in Settings › Clock in. Everybody’s arrival times and where they were.',
  },
  '/registrations': {
    default: 'admins',
    choices: ['admins'],
    enforcement: 'permission',
    by: ['reg.manage', 'reg.view', 'reg.edit', 'reg.approve', 'reg.refund', 'reg.cancel', 'reg.verify', 'reg.email'],
    note: 'The Owner, and whoever the grid gives one of the registrations rights (Access & Privileges). An Admin opens it out of the box through “Correct email addresses” alone, to read and to put an address right; anything more needs its own cell. The public pages, /register/… and /ticket/…, need no sign-in.',
  },
  '/door': {
    default: 'admins',
    choices: ['admins'],
    enforcement: 'permission',
    by: ['reg.manage', 'reg.door', 'reg.door_view', 'reg.door_pay', 'reg.walk_in'],
    note: 'Reception: the Owner, whoever the grid gives “Run registrations”, and whoever it gives “Work the door” (Access & Privileges) — an Admin only with one of those cells.',
  },
  '/volunteers': {
    key: 'volunteers',
    default: 'admins',
    choices: ['team', 'leads', 'admins', 'owner'],
    enforcement: 'page',
    note: 'Opens the page and who holds which role. What may be done on it — invite, give roles, remove, see contact or safeguarding details — is each its own row under People.',
  },
  '/feedback': {
    default: 'team',
    choices: ['team'],
    enforcement: 'permission',
    by: ['feedback.send', 'feedback.manage'],
    note: 'Whoever Access & Privileges gives “Send feedback about the app” — anybody on a team out of the box — and whoever it gives “Read everybody’s feedback”.',
  },
  '/stage': {
    key: 'stage',
    default: 'everyone',
    choices: ['everyone', 'team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'The layouts, their comments and history follow the choice. Who may draw is set in Settings › Stage Layout.',
  },
  '/inventory': {
    key: 'inventory',
    default: 'team',
    choices: ['team', 'leads', 'admins', 'owner'],
    enforcement: 'database',
    note: 'The registers follow the choice.',
  },
}

export type PageAccess = Partial<Record<string, AccessLevel>>

const RANK: Record<Standing, number> = { church: 0, member: 1, lead: 2, admin: 3 }
// Nobody's standing reaches `owner`: the Owner is asked for by name (pageOpening).
const NEEDS: Record<AccessLevel, number> = { everyone: 0, team: 1, leads: 2, admins: 3, owner: 4 }

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

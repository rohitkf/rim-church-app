/**
 * The permissions the church sets for itself, and the question every
 * button asks of them.
 *
 * The database holds the same catalog (`permission_catalog`, from 0133) and
 * enforces it: every converted policy asks `may()`. This copy exists so
 * the grid and the buttons draw at once, without waiting on a request, and
 * `permissionCatalog.test.ts` reads the migrations to keep the two the
 * same. What the church changed — and only that — comes from
 * `role_permissions`.
 *
 * `decide()` mirrors `may()` line for line. It only decides whether a
 * button is worth drawing; the database is the one that holds.
 */

/** How far a permission reaches. Each includes the one before it. */
export type Reach = 'none' | 'own' | 'team' | 'all'

/** The profiles a permission is given to. The Owner is not one: it holds everything. */
export type GrantRole = 'admin' | 'head' | 'assistant' | 'coordinator' | 'member' | 'newcomer'

export const GRANT_ROLES: readonly GrantRole[] = ['admin', 'head', 'assistant', 'coordinator', 'member', 'newcomer']

/**
 * Overwatch and Pastor (0214): church-wide standings with columns of their
 * own. Overwatch has a handful of cells; a capability that does not name
 * it gives it a fixed No. A Pastor has a cell on every row since 0268 —
 * No out of the box unless the row says otherwise — bar the few in
 * PASTOR_LOCKED. They are never a team's to set, and nothing is granted
 * through them.
 */
export type StandingRole = 'overwatch' | 'pastor'

/** Every column the church sets a cell in. */
export type GridRole = GrantRole | StandingRole

export const GRID_ROLES: readonly GridRole[] = [...GRANT_ROLES, 'overwatch', 'pastor']

/**
 * The profiles a team can set its own rules for (0162): the ones whose
 * "team" is a particular team. An Admin's reach is the church's; a Church
 * Member is everybody.
 */
export const TEAM_ROLES: readonly GrantRole[] = ['head', 'assistant', 'coordinator', 'member']

export interface Rule {
  /** What this profile can be given, narrowest first. One means fixed. */
  reaches: readonly Reach[]
  /** What it has out of the box. */
  byDefault: Reach
}

export const REACHES: readonly Reach[] = ['none', 'own', 'team', 'all']

export const REACH_LABEL: Record<Reach, string> = {
  none: 'No',
  own: 'Their own',
  team: 'Their team',
  all: 'Everywhere',
}

/** The same, short enough for six columns side by side. */
export const REACH_SHORT: Record<Reach, string> = {
  none: 'No',
  own: 'Own',
  team: 'Team',
  all: 'All',
}

const offer = (reaches: string, byDefault: Reach): Rule => ({
  reaches: reaches.split(' ') as Reach[],
  byDefault,
})
const fixed = (reach: Reach = 'none'): Rule => ({ reaches: [reach], byDefault: reach })

/** One Stage Layout switch (0212): anybody's as the church gives it — an Admin's too, starting at Yes (0275). */
const STAGE_RULE = {
  admin: offer('none all', 'all'),
  head: offer('none all', 'none'),
  assistant: offer('none all', 'none'),
  coordinator: offer('none all', 'none'),
  member: offer('none all', 'none'),
  newcomer: offer('none all', 'none'),
}

/** One planner button (0211): nobody's out of the box, anybody's but a Church Member's to be given. */
const PLANNER_RULE = {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  }

/**
 * A thing only Overwatch does, as Overwatch (0214): every other profile's
 * cell a fixed No, so nothing may be granted of it.
 */
const OVERWATCH_ONLY = {
  admin: fixed(),
  head: fixed(),
  assistant: fixed(),
  coordinator: fixed(),
  member: fixed(),
  newcomer: fixed(),
  overwatch: offer('none all', 'all'),
}

/**
 * A room of Settings, one of the keys, or a thing that was the Owner's
 * alone (0277): anybody's as the church gives it — a role's cell, or a
 * grant to a team or a person. `admin` is where an Admin starts: Yes for
 * what was an Admin's by standing, No for what was the Owner's.
 */
const given = (admin: Reach, others: Partial<Record<'head' | 'assistant' | 'member', Reach>> = {}) => ({
  admin: offer('none all', admin),
  head: offer('none all', others.head ?? 'none'),
  assistant: offer('none all', others.assistant ?? 'none'),
  coordinator: offer('none all', 'none'),
  member: offer('none all', others.member ?? 'none'),
  newcomer: offer('none all', 'none'),
})

/**
 * Who may open a page (0215): its level in Settings › Page by Page, as
 * cells. Admins and the leads start let in, and where a page can be kept
 * to Heads their cells are a choice too (0274: Admins only, the Owner only); a
 * Team Member's cell is a choice only where the page can be kept to Heads,
 * a Church Member's only where it can be opened to everyone; a Team
 * Coordinator opens a page as the Team Member they are. `levels` is the
 * page's choices, `open` its default.
 */
const page = (levels: 'everyone team leads' | 'team leads', open: 'everyone' | 'team' | 'admins') => ({
  // Every rung is a choice (0274, 0277): a page can be kept to the Heads,
  // to the Admins, or to the Owner, each cell starting where its level
  // puts it. `admins` is a page that starts as the Admins' alone.
  admin: offer('none all', 'all'),
  head: offer('none all', open === 'admins' ? 'none' : 'all'),
  assistant: offer('none all', open === 'admins' ? 'none' : 'all'),
  // A Team Coordinator opens a page as the Team Member they are.
  coordinator: fixed(),
  member: offer('none all', open === 'admins' ? 'none' : 'all'),
  // Where the page needs a team to mean anything, a Church Member has no cell.
  newcomer: levels.includes('everyone') ? offer('none all', open === 'everyone' ? 'all' : 'none') : fixed(),
})

/*
 * One entry per capability, five profiles each — the same as the
 * migration's insert, cell for cell. A new area's capabilities arrive here
 * in the same release as the migration that adds them to the catalog and
 * the policies that read them.
 */
export const CATALOG = {
  // The grid itself (0277): every cell a choice. It was every Admin's and
  // nobody else's; the Owner always passes, which is how a wrong setting —
  // this one included — gets put right.
  'app.permissions': given('all'),
  // Who is given a role (0277): an Admin's row, and every other role's.
  'people.roles': given('all'),
  'people.admins': given('all'),
  // Taking Admin from somebody else was the Owner's alone.
  'people.unadmin': given('none'),
  // The rooms of Settings (0277), each its own row.
  'settings.general': given('all'),
  'settings.menu': given('all'),
  'settings.pages': given('all'),
  'settings.rota': given('all'),
  'settings.stage': given('all'),
  'settings.clockin': given('all'),
  'settings.prayer': given('all'),
  'settings.overwatch': given('all'),
  // These four were the Owner's alone.
  'settings.logo': given('none'),
  'settings.video': given('none'),
  'settings.feedback': given('none'),
  'settings.erase': given('none'),
  // Feedback (0277): sending it was anybody's on a team; reading and
  // answering everybody's was the Owner's.
  'feedback.send': given('all', { head: 'all', assistant: 'all', member: 'all' }),
  'feedback.manage': given('none'),
  // Everybody's contact details and households, and everybody's visa and
  // DBS details (0277): the Owner's alone until the Owner says otherwise.
  'people.contacts': given('none'),
  'people.compliance': given('none'),
  'rota.assign': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'rota.tag': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'rota.release_ask': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'rota.release_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'rota.release_delete': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.manage': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.templates': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.sessions': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.guests': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.repeat': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.events': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'svc.call_times': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'team.create': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'team.edit': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Who approves a request to be clocked in (0213): Admins out of the box
  // (a choice since 0275); anybody else as the church says, or by a grant —
  // a team's, perhaps for its Heads alone.
  'clockin.approve': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Who sees the Clock In page and every clock-in (0209): Admins out of
  // the box (a choice since 0275); anybody else as the church says, or by
  // a grant (0208).
  'clockin.view': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Prayer's three (0210): the Pastors (their own column since 0214) and
  // the Owner always; anybody else as the church says, or by a grant.
  // Admins are not pastors by default.
  'prayer.pastoral': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
    // A choice since 0277, starting where it was fixed.
    pastor: offer('none all', 'all'),
  },
  'prayer.assign': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
    // A choice since 0277, starting where it was fixed.
    pastor: offer('none all', 'all'),
  },
  'prayer.lists': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
    // A choice since 0277, starting where it was fixed.
    pastor: offer('none all', 'all'),
  },
  // The Service Planner's buttons on their own (0211): whoever plans the
  // running order or runs the service has them all through svc.sessions
  // and svc.manage; these give one without the rest.
  'planner.start': PLANNER_RULE,
  'planner.hold': PLANNER_RULE,
  'planner.add_time': PLANNER_RULE,
  'planner.skip': PLANNER_RULE,
  'planner.substitute': PLANNER_RULE,
  'planner.add_below': PLANNER_RULE,
  'planner.remove': PLANNER_RULE,
  'planner.end': PLANNER_RULE,
  // What may be done to a stage layout (0212), each switch a capability.
  'stage.add': STAGE_RULE,
  'stage.edit': STAGE_RULE,
  'stage.delete': STAGE_RULE,
  'stage.comment': STAGE_RULE,
  'stage.templates': STAGE_RULE,
  // Asking to join a team (0190): out of the box a Church Member is added
  // by a head rather than asking.
  'team.request_join': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'all'),
    assistant: offer('none all', 'all'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'all'),
    newcomer: offer('none all', 'none'),
    // Overwatch is on no team by asking: request_team_join() refuses it
    // whatever a cell says, so there is no cell to set (0272).
    overwatch: fixed(),
  },
  'team.members': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'team.roles': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'team.groups': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'team.checklists': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'team.join': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'day.verify': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'team'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Check all (0232): the Owner always; nobody else until the church says so.
  'day.check_all': {
    admin: offer('none all', 'none'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'day.ready': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'team'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'day.attendance': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'day.nudge': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'avail.edit_others': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'avail.add_others': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'avail.late_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'avail.nudge': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'avail.history': {
    admin: offer('none all', 'all'),
    head: offer('none own team all', 'team'),
    assistant: offer('none own team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none own team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'inv.items': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'inv.stock': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'inv.purchase_ask': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'team'),
    newcomer: offer('none all', 'none'),
  },
  'inv.purchase_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Overwatch's three switches on these rows (0214) are things done as
  // Overwatch, read by overwatch_may() rather than may(): the church-wide
  // board only, as themselves, on a page open to Overwatch.
  'msg.board_post': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'team'),
    newcomer: offer('none all', 'none'),
    overwatch: offer('none all', 'all'),
  },
  'msg.board_moderate': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'msg.chat': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'team'),
    newcomer: offer('none all', 'none'),
    overwatch: offer('none all', 'all'),
  },
  'msg.chat_moderate': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'msg.polls': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
    overwatch: offer('none all', 'all'),
  },
  'msg.updates': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'msg.alert_team': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'msg.alert': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'issue.mark': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'issue.delete': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Overwatch's alone (0214): raised as Overwatch, in a group of their own.
  'issue.as_overwatch': OVERWATCH_ONLY,
  // The song library (0243): Admins, and the worship team by its own
  // cells; any other team is ticked in Page by Page › Songs.
  'songs.edit': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Registrations (0244): events anybody can sign up for. The Owner
  // always; an Admin or anybody else only by the church's choice.
  'reg.manage': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // See the Countdown page (0264): every role a choice, teams and people by
  // grant. Opens the page only; what it shows is the Service Planner's.
  'countdown.view': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'all'),
    assistant: offer('none all', 'all'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'all'),
    newcomer: offer('none all', 'none'),
  },
  // Work the door (0247): scan tickets, take money at reception, check
  // people in, register a walk-in — without being able to change events.
  'reg.door': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // The parts of registrations, each its own right (0251).
  'reg.view': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
    // A Pastor reads registrations out of the box (0267).
    pastor: offer('none all', 'all'),
  },
  // Verify a payment (0267): say it arrived in the bank or PayPal. Its own
  // right — "Run registrations" does not give it — and a Pastor's out of
  // the box, because the Pastor is who can see the accounts.
  'reg.verify': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
    pastor: offer('none all', 'all'),
  },
  // See Reception without working it (0267): the list and the counts.
  'reg.door_view': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
    pastor: offer('none all', 'all'),
  },
  'reg.edit': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'reg.approve': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'reg.refund': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'reg.cancel': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'reg.door_pay': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'reg.walk_in': {
    admin: offer('none all', 'none'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'set.edit': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'team'),
    newcomer: offer('none all', 'none'),
  },
  'debrief.manage': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'debrief.contribute': {
    admin: offer('none all', 'none'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none team all', 'none'),
    member: offer('none team all', 'team'),
    newcomer: offer('none all', 'none'),
  },
  // Overwatch's alone (0214): its own write-up of a service, beside every team's.
  'debrief.as_overwatch': OVERWATCH_ONLY,
  'give.edit': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'people.edit_others': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'people.invite': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'people.clear_records': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'people.onboard': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none team all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // How old people are (0258): the whole date of birth. Everybody keeps
  // their own and everybody's birthday (the day, without the year).
  'people.ages': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  'people.remove': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: offer('none all', 'none'),
    member: offer('none all', 'none'),
    newcomer: offer('none all', 'none'),
  },
  // Opening a page (0215), one per page with a choice of who may.
  'page.service_planner': page('everyone team leads', 'everyone'),
  'page.rota': page('everyone team leads', 'team'),
  'page.set_lists': page('everyone team leads', 'everyone'),
  'page.debriefs': page('team leads', 'team'),
  'page.messages': page('everyone team leads', 'team'),
  'page.updates': page('everyone team leads', 'everyone'),
  'page.polls': page('everyone team leads', 'everyone'),
  'page.events': page('everyone team leads', 'everyone'),
  'page.giving': page('everyone team leads', 'everyone'),
  'page.departments': page('everyone team leads', 'team'),
  'page.prayer': page('everyone team leads', 'everyone'),
  'page.stage': page('everyone team leads', 'everyone'),
  'page.inventory': page('team leads', 'team'),
  // The pages that had one level and no choice (0277).
  'page.availability': page('team leads', 'team'),
  'page.checklists': page('team leads', 'team'),
  'page.team_chat': page('team leads', 'team'),
  'page.songs': page('everyone team leads', 'everyone'),
  'page.volunteers': page('team leads', 'admins'),
} as const satisfies Record<string, Record<GrantRole, Rule> & Partial<Record<StandingRole, Rule>>>

export type CapabilityKey = keyof typeof CATALOG

export const CAPABILITY_KEYS = Object.keys(CATALOG) as CapabilityKey[]

export function isCapabilityKey(value: string): value is CapabilityKey {
  return Object.prototype.hasOwnProperty.call(CATALOG, value)
}

const NO_CELL: Rule = fixed()

/**
 * A Pastor's cell on a row that does not name one (0268): the church's to
 * give, No out of the box. `may()` reads a Pastor as a church-wide tier,
 * so the choice is No or Everywhere.
 */
const PASTOR_CELL: Rule = offer('none all', 'none')

/**
 * The rows a Pastor has no cell on: the two things done as Overwatch, and
 * opening Prayer Requests, which a Pastor always may (pageOpening) and no
 * cell says. The grid itself is a choice since 0277.
 */
export const PASTOR_LOCKED: readonly string[] = ['issue.as_overwatch', 'debrief.as_overwatch', 'page.prayer']

/**
 * The five things Overwatch does *as Overwatch* (0214): its cells there
 * are read by overwatch_may(), each only on a page Settings › Overwatch
 * leaves open — never by may().
 */
export const OVERWATCH_OWN: readonly string[] = ['msg.board_post', 'msg.chat', 'msg.polls', 'issue.as_overwatch', 'debrief.as_overwatch']

/**
 * Whether Overwatch has no cell of the ordinary kind on a row (0270):
 * what it already reads through its own room — every page's opening, the
 * clock-ins and the availability history — where a cell saying No would
 * be untrue.
 */
export function overwatchLocked(cap: string): boolean {
  return cap === 'clockin.view' || cap === 'avail.history' || cap.startsWith('page.')
}

/** One cell's rule. A column a capability does not name is a fixed No — or, a Pastor's (0268) or Overwatch's (0270), the church's choice. */
export function ruleFor(cap: CapabilityKey, role: GridRole): Rule {
  const entry: Partial<Record<GridRole, Rule>> = CATALOG[cap]
  if (entry[role]) return entry[role]
  if (role === 'pastor' && !PASTOR_LOCKED.includes(cap)) return PASTOR_CELL
  if (role === 'overwatch' && !overwatchLocked(cap)) return PASTOR_CELL
  return NO_CELL
}

export function isFixed(cap: CapabilityKey, role: GridRole): boolean {
  return ruleFor(cap, role).reaches.length === 1
}

/** Whether Overwatch or a Pastor has a cell of its own on this row (0214, 0268). */
export function hasCell(cap: CapabilityKey, role: GridRole): boolean {
  const entry: Partial<Record<GridRole, Rule>> = CATALOG[cap]
  return !!entry[role] || (role === 'pastor' && !PASTOR_LOCKED.includes(cap)) || (role === 'overwatch' && !overwatchLocked(cap))
}

/** A thing only Overwatch does, as Overwatch: nobody else's to be given (0214). */
export function isOverwatchOnly(cap: CapabilityKey): boolean {
  return OVERWATCH_OWN.includes(cap) && GRANT_ROLES.every((role) => isFixed(cap, role) && ruleFor(cap, role).byDefault === 'none')
}

/** The church's changes, cell by cell. A cell it never touched is absent. */
export type Overrides = Partial<Record<CapabilityKey, Partial<Record<GridRole, Reach>>>>

/**
 * One team's own rules (0162), by team id: the cells it set differently
 * from the church. A cell a team never set follows the church's.
 */
export type TeamOverrides = Record<string, Overrides>

/**
 * The reach in force: the church's choice if it is still on offer,
 * otherwise the default. The same order `permission_reach()` uses.
 */
export function reachOf(overrides: Overrides, cap: CapabilityKey, role: GridRole): Reach {
  const rule = ruleFor(cap, role)
  const chosen = overrides[cap]?.[role]
  return chosen && rule.reaches.includes(chosen) ? chosen : rule.byDefault
}

/** The reaches a team may set for this profile: the catalog's, no wider than the team. */
export function teamReaches(cap: CapabilityKey, role: GridRole): readonly Reach[] {
  if (!(TEAM_ROLES as readonly GridRole[]).includes(role)) return []
  const rule = ruleFor(cap, role)
  if (!rule.reaches.includes('team')) return []
  return rule.reaches.filter((r) => r !== 'all')
}

/** Whether a team can set this cell for itself at all. */
export function isTeamSettable(cap: CapabilityKey, role: GridRole): boolean {
  return teamReaches(cap, role).length > 1
}

/** What this team set for the cell, if it set anything the catalog still offers. */
export function teamChoice(teams: TeamOverrides, dept: string | null | undefined, cap: CapabilityKey, role: GridRole): Reach | null {
  if (!dept) return null
  const chosen = teams[dept]?.[cap]?.[role]
  return chosen && teamReaches(cap, role).includes(chosen) ? chosen : null
}

/** How many cells a team has set for itself (0162) — the ones the catalog still lets it. */
export function ownRuleCount(teams: TeamOverrides, dept: string): number {
  let n = 0
  for (const cap of CAPABILITY_KEYS) {
    for (const role of TEAM_ROLES) if (isTeamSettable(cap, role) && teamChoice(teams, dept, cap, role)) n += 1
  }
  return n
}

/**
 * The reach in force on one team: the team's own rule where it made one,
 * otherwise the church's. The same order `permission_reach(role, cap, dept)`
 * uses.
 */
export function reachOn(
  overrides: Overrides,
  teams: TeamOverrides,
  dept: string | null | undefined,
  cap: CapabilityKey,
  role: GrantRole,
): Reach {
  return teamChoice(teams, dept, cap, role) ?? reachOf(overrides, cap, role)
}

/** Rows from `role_permissions`, as the overrides they are. Unknown rows are ignored. */
export function overridesFrom(rows: { role_key: string; capability: string; reach: string }[]): Overrides {
  const out: Overrides = {}
  for (const row of rows) {
    if (!isCapabilityKey(row.capability)) continue
    if (!(GRID_ROLES as readonly string[]).includes(row.role_key)) continue
    if (!(REACHES as readonly string[]).includes(row.reach)) continue
    // Overwatch and a Pastor have cells only where a capability names them.
    const role = row.role_key as GridRole
    if (!(GRANT_ROLES as readonly string[]).includes(role) && !hasCell(row.capability, role)) continue
    out[row.capability] = { ...out[row.capability], [role]: row.reach as Reach }
  }
  return out
}

/** Rows from `department_permissions`, as the teams' own rules. Unknown rows are ignored. */
export function teamOverridesFrom(
  rows: { department_id: string; role_key: string; capability: string; reach: string }[],
): TeamOverrides {
  const out: TeamOverrides = {}
  for (const row of rows) {
    if (!isCapabilityKey(row.capability)) continue
    if (!(GRANT_ROLES as readonly string[]).includes(row.role_key)) continue
    if (!(REACHES as readonly string[]).includes(row.reach)) continue
    const team = out[row.department_id] ?? {}
    team[row.capability] = { ...team[row.capability], [row.role_key as GrantRole]: row.reach as Reach }
    out[row.department_id] = team
  }
  return out
}

/**
 * One cell, as `set_permissions()` takes it. With a `department` it is
 * that team's own rule; `reach: null` there means "as the church".
 */
export interface PermissionChange {
  role: GridRole
  capability: CapabilityKey
  reach: Reach | null
  department?: string | null
}

/**
 * What saving `next` over `stored` has to send: every cell whose reach in
 * force would change. Fixed cells never appear — there is nothing to send.
 */
export function changesBetween(stored: Overrides, next: Overrides): PermissionChange[] {
  const out: PermissionChange[] = []
  for (const capability of CAPABILITY_KEYS) {
    for (const role of GRID_ROLES) {
      if (isFixed(capability, role)) continue
      const before = reachOf(stored, capability, role)
      const after = reachOf(next, capability, role)
      if (before !== after) out.push({ role, capability, reach: after })
    }
  }
  return out
}

/**
 * What saving `next` over `stored` has to send for the teams' own rules:
 * every team cell whose choice would change, including one being given
 * up (sent as null).
 */
export function teamChangesBetween(stored: TeamOverrides, next: TeamOverrides): PermissionChange[] {
  const out: PermissionChange[] = []
  for (const department of new Set([...Object.keys(stored), ...Object.keys(next)])) {
    for (const capability of CAPABILITY_KEYS) {
      for (const role of TEAM_ROLES) {
        if (!isTeamSettable(capability, role)) continue
        const before = teamChoice(stored, department, capability, role)
        const after = teamChoice(next, department, capability, role)
        if (before !== after) out.push({ role, capability, reach: after, department })
      }
    }
  }
  return out
}

/** Every changeable cell back at the app's default — a draft, until saved. */
export function defaultsOver(stored: Overrides): Overrides {
  const out: Overrides = {}
  for (const capability of CAPABILITY_KEYS) {
    for (const role of GRID_ROLES) {
      if (stored[capability]?.[role] !== undefined) {
        out[capability] = { ...out[capability], [role]: ruleFor(capability, role).byDefault }
      }
    }
  }
  return out
}

/** Who somebody is, as far as permissions go. */
export interface Holder {
  myId: string | null
  owner: boolean
  admin: boolean
  /** Teams they head or assist. */
  ledTeams: readonly string[]
  /** Teams they head, as Head. Left out, every led team counts as headed. */
  headTeams?: readonly string[]
  /** Teams they assist, as Assisting Head (0162). Left out, none. */
  assistTeams?: readonly string[]
  /** Whether they head or assist this team — AuthContext's own test, when there is one. */
  leads?: (departmentId: string) => boolean
  /** Teams whose roster they are on. */
  memberTeams: readonly string[]
  /** Whether the rota has them in Team Coordinator anywhere. */
  coordinatesAnywhere?: boolean
  /** Whether they are a Pastor (0214). Left out, not. */
  pastor?: boolean
  /** Whether they are Overwatch (0270). Left out, not. */
  overwatch?: boolean
  /**
   * The church's grants (0208): one thing more, for a person by name or
   * for everybody on a team. Left out, none.
   */
  grants?: readonly PermissionGrant[]
  /**
   * What this person is refused by name (0273), whatever their profiles,
   * their teams or a grant say. Left out, nothing. Passed by for an Admin,
   * as `may()` passes it by.
   */
  blocked?: readonly string[]
}

/** One person refused one capability (0273). */
export interface PermissionBlock {
  userId: string
  capability: string
}

/**
 * What one person may be blocked from: what a grant could give — the rows
 * `may()` alone answers — less opening a page, which the pages' own levels
 * draw, and — for somebody who is Overwatch — less the five things done
 * as Overwatch, which `overwatch_may()` answers and a block would not reach.
 */
export function blockableCapabilities(overwatch = false): CapabilityKey[] {
  return grantableCapabilities().filter(
    (cap) => !cap.startsWith('page.') && !(overwatch && OVERWATCH_OWN.includes(cap)),
  )
}

/**
 * One thing more (0208): a capability for a person by name, or for
 * everybody on a team — its roster, its Head and Assisting Heads — on the
 * teams they are on, or everywhere. `may()` asks these after every rule the
 * grid has, so a grant only ever adds.
 */
export interface PermissionGrant {
  id?: string
  capability: string
  userId: string | null
  departmentId: string | null
  reach: GrantReach
  /** A team's grant for its Head and Assisting Heads alone, not its roster (0213). */
  leadsOnly?: boolean
  /** When it ends (0218), or null for good. One past its end is never in the list. */
  expiresAt?: string | null
}

/** How far a grant reaches: on the teams they are on (a team's grant, that team), or everywhere. */
export type GrantReach = 'team' | 'all'

/**
 * Whether this may be granted at this reach — `permission_grant_is_valid()`:
 * a capability the church could give some profile other than Admin, at a
 * reach such a profile may be offered. Never the keys to the app.
 */
export function grantIsValid(cap: CapabilityKey, reach: GrantReach): boolean {
  return (['head', 'assistant', 'coordinator', 'member', 'newcomer'] as const).some((role) => {
    const { reaches } = ruleFor(cap, role)
    return reaches.length > 1 && reaches.includes(reach)
  })
}

/** Every capability that may be granted, at some reach. */
export function grantableCapabilities(): CapabilityKey[] {
  return (Object.keys(CATALOG) as CapabilityKey[]).filter((cap) => grantIsValid(cap, 'team') || grantIsValid(cap, 'all'))
}

/** Where the thing being done sits. */
export interface Where {
  departmentId?: string | null
  /** The rota has them in Team Coordinator for this team, at this service. */
  coordinating?: boolean
  /** Whose the row is. */
  ownerId?: string | null
}

/** Who gave a yes: the Owner, the profile whose reach covered it, or a grant (0208). */
export type Granter = 'owner' | GrantRole | 'pastor' | 'overwatch' | 'grant'

/**
 * Which of this person's profiles lets them do this, here — the first, in
 * `may()`'s own order — or null when none does. `decide()` is this, asked
 * as a yes or no; Settings › Access › By person asks it for the reason.
 *
 * Mirrors `may()` in SQL: the Owner always; otherwise any profile they
 * hold that reaches this far — on this team by the team's own rule where
 * it made one (0162), else the church's.
 */
export function grantedBy(
  overrides: Overrides,
  holder: Holder,
  cap: CapabilityKey,
  where: Where = {},
  teams: TeamOverrides = {},
): Granter | null {
  if (!holder.myId) return null
  if (holder.owner) return 'owner'
  // Refused by name (0273): asked before every tier, as may() asks it.
  if (!holder.admin && holder.blocked?.includes(cap)) return null
  const mine = !!where.ownerId && where.ownerId === holder.myId
  const dept = where.departmentId ?? null
  const on = (role: GrantRole) => reachOn(overrides, teams, dept, cap, role)

  let reach = reachOf(overrides, cap, 'newcomer')
  if (reach === 'all' || (reach !== 'none' && mine)) return 'newcomer'

  reach = reachOf(overrides, cap, 'admin')
  if (reach !== 'none' && holder.admin && (reach === 'all' || mine)) return 'admin'

  // A Pastor (0214), church-wide as an Admin is.
  reach = reachOf(overrides, cap, 'pastor')
  if (reach !== 'none' && holder.pastor && (reach === 'all' || mine)) return 'pastor'

  // Overwatch (0270), the same — but never on the five things it does as
  // Overwatch: those cells are what overwatch_may() reads, not may().
  if (holder.overwatch && !OVERWATCH_OWN.includes(cap)) {
    reach = reachOf(overrides, cap, 'overwatch')
    if (reach !== 'none' && (reach === 'all' || mine)) return 'overwatch'
  }

  // The Head and the Assisting Head: two profiles since 0162, the same
  // rules unless the church says otherwise. A holder that does not say
  // which teams it heads is read as heading every team it leads.
  const headTeams = holder.headTeams ?? holder.ledTeams
  const assistTeams = holder.assistTeams ?? []
  const leadsHere = !!dept && (holder.leads ? holder.leads(dept) : holder.ledTeams.includes(dept))
  const headsHere = !!dept && (holder.headTeams ? headTeams.includes(dept) : leadsHere)
  const assistsHere = !!dept && assistTeams.includes(dept)

  reach = on('head')
  if (reach !== 'none' && (headTeams.length > 0 || headsHere)) {
    if (reach === 'all' || mine || (reach === 'team' && headsHere)) return 'head'
  }

  reach = on('assistant')
  if (reach !== 'none' && (assistTeams.length > 0 || assistsHere)) {
    if (reach === 'all' || mine || (reach === 'team' && assistsHere)) return 'assistant'
  }

  reach = on('member')
  if (reach !== 'none') {
    if (reach === 'team' && !!dept && holder.memberTeams.includes(dept)) return 'member'
    if ((reach === 'all' || mine) && holder.memberTeams.length > 0) return 'member'
  }

  reach = on('coordinator')
  if (reach !== 'none') {
    if ((reach === 'team' || reach === 'all') && !!dept && where.coordinating) return 'coordinator'
    if ((reach === 'all' || mine) && (holder.coordinatesAnywhere || where.coordinating)) return 'coordinator'
  }

  // A grant, asked last as may() asks it (0208): theirs by name, or their
  // team's; everywhere, on what is theirs, or on a team they are on.
  const onTeam = (id: string) => holder.memberTeams.includes(id) || holder.ledTeams.includes(id)
  for (const grant of holder.grants ?? []) {
    if (grant.capability !== cap) continue
    const held = grant.userId
      ? grant.userId === holder.myId
      : !!grant.departmentId &&
        (grant.leadsOnly ? holder.ledTeams.includes(grant.departmentId) : onTeam(grant.departmentId))
    if (!held) continue
    if (grant.reach === 'all' || mine) return 'grant'
    if (dept && (grant.departmentId === dept || (!!grant.userId && onTeam(dept)))) return 'grant'
  }

  return null
}

/** May this person do this, here? `grantedBy()`, as a yes or no. */
export function decide(
  overrides: Overrides,
  holder: Holder,
  cap: CapabilityKey,
  where: Where = {},
  teams: TeamOverrides = {},
): boolean {
  return grantedBy(overrides, holder, cap, where, teams) !== null
}

/**
 * Whether this person may do this on some team, but not necessarily
 * everywhere — for deciding which teams a page should offer them.
 * "Everywhere" for any profile they hold widens it to every team.
 */
export function reachesEverywhere(overrides: Overrides, holder: Holder, cap: CapabilityKey): boolean {
  return decide(overrides, holder, cap, { departmentId: null })
}

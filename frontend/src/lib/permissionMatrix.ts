/**
 * Who can do what, written down — and, area by area, chosen by the church.
 *
 * Every permission is enforced by Postgres on every query, which is why it
 * holds: a rule the database applies cannot be talked out of it by a
 * browser with devtools open. Until 0133 that meant every rule was a
 * policy and this file only described them.
 *
 * Now a row with a `key` is the church's to set. Its policy asks `may()`,
 * and `may()` reads the grid in Settings › Access & Privileges (see
 * lib/permissions.ts). Its `can` below is drawn from the catalog's
 * defaults; `withGrants` redraws it with what the church chose.
 *
 * A row without a key is still a policy, read off `pg_policies` on the
 * date in CHECKED_ON. It can drift — nothing makes a policy added next
 * spring update this file — and the page says so. Its area becomes
 * editable when a release converts it.
 */

import { levelOf, standingMayOpen, type PageAccess, type Standing } from './pageAccess'
import { GRANT_ROLES, isFixed, reachOf, type CapabilityKey, type Overrides, type Reach } from './permissions'
import { ROLE_NAME } from './roleNames'

export const CHECKED_ON = '10 October 2026'

/** The standings a person can hold. Columns, left to right. */
export const ROLES = [
  {
    key: 'owner',
    label: ROLE_NAME.owner,
    blurb: 'The one account that cannot be removed, and the only one that can hand ownership on.',
  },
  { key: 'admin', label: ROLE_NAME.admin, blurb: 'Runs the church’s app. Everything below, everywhere.' },
  {
    key: 'head',
    label: ROLE_NAME.head,
    blurb: 'The Head of a team. Their own team only.',
  },
  {
    key: 'assistant',
    label: ROLE_NAME.assistant,
    blurb:
      'The Head’s deputy. Given the same as the Head out of the box, and their own column here since October 2026, so a church can set the two apart. Their own team only.',
  },
  {
    key: 'coordinator',
    label: ROLE_NAME.coordinator,
    blurb: 'Whoever the rota puts in Team Coordinator, for that service only. Not a standing rank.',
  },
  {
    key: 'member',
    label: ROLE_NAME.member,
    blurb: 'On at least one team — and a Church Member too, as everybody signed in is.',
  },
  {
    key: 'newcomer',
    label: ROLE_NAME.newcomer,
    blurb:
      'Signed in and on no team. They see the church’s shape — the services and the countdown, the diary, the set lists and the Giving page — and none of the teams’ own working: no rota, no register, no boards, no call times, no debriefs. A team head adding them makes them a Team Member; an Admin can also make them a Head or an Admin from Volunteers.',
  },
] as const

export type RoleKey = (typeof ROLES)[number]['key']

/** Yes, no, or yes-but-only-your-own. */
export type Allowed = 'yes' | 'no' | 'own' | 'team'

export interface Capability {
  action: string
  /**
   * The capability in the church's grid (lib/permissions.ts), when this
   * row is one. Its `can` is then the grid's, not a transcription.
   */
  key?: CapabilityKey
  /** Said out loud when the answer needs a sentence rather than a tick. */
  note?: string
  /**
   * The action in two or three words, for a grid too narrow for the
   * sentence — the team-by-team grids in Settings › Page by Page.
   */
  short?: string
  /**
   * The pages this row is about (routes, or lib/settingsCatalog's names
   * for the places that are not pages), when not the whole area's.
   */
  at?: string[]
  can: Record<RoleKey, Allowed>
  /**
   * The page whose "who can open it" setting decides this row (Settings ›
   * Access & Privileges › Pages). The grid above is the app's defaults;
   * `withPageAccess` redraws these rows with the church's own choices.
   */
  page?: string
}

export interface PermissionArea {
  area: string
  /**
   * The pages this area is about, as routes — or lib/settingsCatalog's
   * names for the places that are not pages. Settings › Page by Page
   * files each row under them; a row can say its own in `at`.
   */
  pages: string[]
  capabilities: Capability[]
  /**
   * Said when the area is deliberately not the grid's: who holds the keys
   * to the app, and the Owner's own mailbox. Changing these from the grid
   * would let somebody hand themselves the grid.
   */
  fixed?: string
  /**
   * Said when the area is set team by team (Settings › Page by Page): the
   * church's own cells for the team profiles are then only what a new
   * team starts with.
   */
  perTeam?: string
}

const ALLOWED: Record<Reach, Allowed> = { none: 'no', own: 'own', team: 'team', all: 'yes' }

/** A row the church sets: the Owner always, everybody else as the grid says. */
const granted = (key: CapabilityKey, overrides: Overrides = {}): Record<RoleKey, Allowed> => ({
  owner: 'yes',
  ...(Object.fromEntries(GRANT_ROLES.map((role) => [role, ALLOWED[reachOf(overrides, key, role)]])) as Record<
    Exclude<RoleKey, 'owner'>,
    Allowed
  >),
})

const all = (over: Partial<Record<RoleKey, Allowed>> = {}): Record<RoleKey, Allowed> => ({
  owner: 'yes',
  admin: 'yes',
  head: 'no',
  // A fixed row is a policy, and the policies read Head and Assisting
  // Head as one (is_dept_head), so the deputy's column says what the
  // Head's does unless a row says otherwise.
  assistant: over.head ?? 'no',
  coordinator: 'no',
  member: 'no',
  // A new account can do none of it until somebody puts them on a team;
  // the handful of things they can see say so row by row.
  newcomer: 'no',
  ...over,
})

export const PERMISSIONS: PermissionArea[] = [
  {
    area: 'Services & planning',
    pages: ['/service-planner', '/events'],
    capabilities: [
      {
        action: 'See services and the running order',
        at: ['/service-planner'],
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'The church’s own shape, open to anybody signed in — it is what the countdown on the dashboard counts to.',
      },
      {
        action: 'Create, edit or delete a service',
        key: 'svc.manage',
        at: ['/service-planner'],
        short: 'Manage services',
        can: granted('svc.manage'),
        note: 'Ending a service early too, which can also be given on its own in Page by Page › Service Planner › Planner buttons.',
      },
      {
        action: 'Build and edit service templates',
        key: 'svc.templates',
        at: ['/service-planner'],
        short: 'Templates',
        can: granted('svc.templates'),
      },
      {
        action: 'Set session times and the run sheet',
        key: 'svc.sessions',
        at: ['/service-planner'],
        short: 'Run sheet',
        can: granted('svc.sessions'),
        note: 'Until the service has finished; afterwards it is a record. Its menu’s buttons — Session started, Add time, Skip and the rest — can also be given one by one to a team or a person, in Page by Page › Service Planner › Planner buttons.',
      },
      {
        action: 'Add a guest to a service',
        key: 'svc.guests',
        at: ['/service-planner'],
        short: 'Add guests',
        can: granted('svc.guests'),
        note: 'Guests are visible to everyone once added.',
      },
      {
        action: 'Set a service to repeat, or stop it repeating',
        key: 'svc.repeat',
        at: ['/service-planner'],
        short: 'Repeat services',
        can: granted('svc.repeat'),
        note: 'Each service a repeat makes is its own from then on: deleting one Sunday never touches the others.',
      },
      {
        action: 'See the church diary',
        at: ['/events'],
        page: '/events',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
      },
      {
        action: 'Add, edit or remove an event in the church diary',
        key: 'svc.events',
        at: ['/events'],
        short: 'Diary events',
        can: granted('svc.events'),
        note: '“Their team” is their own team’s events. A church-wide event belongs to no team, so it takes “Everywhere”.',
      },
      {
        action: 'Set a team’s call time',
        key: 'svc.call_times',
        at: ['/service-planner', '/checklists'],
        short: 'Call times',
        can: granted('svc.call_times'),
        note: 'Anybody on a team can read every team’s — knowing Worship is called at eight is how whoever opens up knows who to expect. Somebody on no team reads none of them.',
      },
    ],
  },
  {
    area: 'Team rota',
    pages: ['/rota'],
    capabilities: [
      {
        action: 'See the rota',
        page: '/rota',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Anybody on a team sees every team’s Sunday. It was open to anybody signed in until September 2026.',
      },
      {
        action: 'Assign somebody to a role',
        key: 'rota.assign',
        short: 'Assign roles',
        can: granted('rota.assign'),
        note: 'Moving or removing somebody too. A Coordinator’s “their team” is the team they coordinate, at that service only.',
      },
      {
        action: 'Tag an assignment — Shadow, and the church’s other tags',
        key: 'rota.tag',
        short: 'Tag roles',
        can: granted('rota.tag'),
        note: 'A tag is a label, not an exemption: a shadow is still that person’s one role at the service.',
      },
      {
        action: 'Choose the rota’s tags and the Coordinator’s colour',
        can: all(),
        note: 'In Settings › Team Rota.',
      },
      {
        action: 'Ask another team to release a volunteer',
        key: 'rota.release_ask',
        short: 'Ask a release',
        can: granted('rota.release_ask'),
        note: '“Their team” is the team that wants the person.',
      },
      {
        action: 'Approve or refuse a release request',
        key: 'rota.release_decide',
        short: 'Decide releases',
        can: granted('rota.release_decide'),
        note: '“Their team” is the team that has the person. Approving frees them.',
      },
      {
        action: 'Delete a release request outright',
        key: 'rota.release_delete',
        short: 'Delete releases',
        can: granted('rota.release_delete'),
        note: 'Anybody can still withdraw a request they sent.',
      },
    ],
  },
  {
    area: 'Teams & roles',
    pages: ['/departments'],
    capabilities: [
      {
        action: 'See teams, their roles and their checklists',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'A Church Member does not see the Teams page out of the box: a team head adds them (0189). Settings › Page by page can open it to everyone.',
      },
      {
        action: 'Ask to join a team',
        key: 'team.request_join',
        short: 'Ask to join',
        can: granted('team.request_join'),
        note: 'The head of that team says yes or no. The database refuses anybody this says no to, button or not. A Church Member asks from the Teams page, so they need that page opened to them too (Settings › Page by page).',
      },
      {
        action: 'See who heads a team, and who assists',
        can: all({ head: 'yes', coordinator: 'yes', member: 'team' }),
        note: 'Your own teams. Until September 2026 only an Admin could see this, so the roster showed no Head at all to the people on it.',
      },
      {
        action: 'Create or delete a team',
        key: 'team.create',
        short: 'Create teams',
        can: granted('team.create'),
      },
      {
        action: 'Rename a team, set its colour or handbook',
        key: 'team.edit',
        short: 'Edit the team',
        can: granted('team.edit'),
      },
      {
        action: 'Add or remove team members',
        key: 'team.members',
        short: 'Members',
        can: granted('team.members'),
        note: 'Finding somebody by email address comes with it.',
      },
      {
        action: 'Add, rename or reorder roles',
        key: 'team.roles',
        short: 'Roles',
        can: granted('team.roles'),
      },
      {
        action: 'Group roles, and file roles into groups',
        key: 'team.groups',
        short: 'Role groups',
        can: granted('team.groups'),
      },
      {
        action: 'Write a role’s standing checklist',
        key: 'team.checklists',
        short: 'Checklists',
        can: granted('team.checklists'),
      },
      {
        action: 'See and answer requests to join a team',
        key: 'team.join',
        short: 'Join requests',
        can: granted('team.join'),
      },
    ],
  },
  {
    area: 'On the day',
    pages: ['/checklists'],
    capabilities: [
      {
        action: 'See your own checklist and tick it off',
        can: all({ head: 'own', coordinator: 'own', member: 'own' }),
        note: 'From your team’s call time on the day of the service until the service finishes — not before. The “After the service” half stays open for a while after the end (two hours unless Settings › Page by Page says otherwise), because that is when it is done. A box ticked at home says nothing about whether the thing was done. An Admin can put a service right either side of that.',
      },
      {
        action: 'Tick off and verify somebody else’s checklist',
        key: 'day.verify',
        short: 'Verify checklists',
        can: granted('day.verify'),
        note: 'A Coordinator’s “their team” is the team they coordinate, at that service. The same window applies: nobody ticks before the call time — except an Admin, who can put a service right either side of it. The Sign-off team signs every team off, whatever this says.',
      },
      {
        action: 'Mark a team ready for the service (the green light)',
        key: 'day.ready',
        short: 'Mark ready',
        can: granted('day.ready'),
        note: 'From the team’s call time on the day of the service — before then the switch is shown but held — until the service finishes. An Admin can change it at any time. Anybody on a team sees the lights.',
      },
      {
        action: 'Log a team’s headcount for a service — expected and actual',
        key: 'day.attendance',
        short: 'Headcount',
        can: granted('day.attendance'),
        note: 'What the assistant records when asked to log attendance. Marking who turned up is changing their answer, under Availability.',
      },
      {
        action: 'Nudge somebody who has not finished',
        key: 'day.nudge',
        short: 'Nudge',
        can: granted('day.nudge'),
        note: '“Everywhere” can nudge every team at once.',
      },
    ],
  },
  {
    area: 'Availability',
    pages: ['/availability'],
    perTeam:
      'Set team by team, in Settings › Page by Page › Availability: who on each team may change answers and see the history. What is shown here is what a new team starts with.',
    capabilities: [
      {
        action: 'Answer your own availability',
        can: all({ owner: 'own', admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
        note: 'Until the service has finished. Afterwards the answer is a record, and nobody edits it.',
      },
      {
        action: 'See what a team has answered',
        can: all({ head: 'team', coordinator: 'team' }),
      },
      {
        action: 'Change somebody else’s answer, and mark who turned up',
        key: 'avail.edit_others',
        short: 'Change answers',
        can: granted('avail.edit_others'),
        note: 'For the phone call that says “put me down, I forgot”: change the answer somebody gave, and mark who turned up. Answering for somebody who has not answered, or taking an answer away, is the row below.',
      },
      {
        action: 'Ask to change your answer after it has closed',
        can: all({ owner: 'own', admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
        note: 'Your own team’s Head approves or refuses it.',
      },
      {
        action: 'Approve or refuse a late change',
        key: 'avail.late_decide',
        short: 'Late changes',
        can: granted('avail.late_decide'),
      },
      {
        action: 'Add or remove somebody else’s answer',
        key: 'avail.add_others',
        short: 'Add or remove answers',
        can: granted('avail.add_others'),
        note: 'Changing an answer that is already there is the row above.',
      },
      {
        action: 'Nudge whoever has not answered',
        key: 'avail.nudge',
        short: 'Nudge',
        can: granted('avail.nudge'),
      },
      {
        action: 'See the history of somebody’s answers',
        key: 'avail.history',
        short: 'History',
        can: granted('avail.history'),
        note: 'Every time an answer was given, changed or taken away — what it said, who did it and when. “Their own” is a person’s own answers. It is kept as long as the answer is.',
      },
    ],
  },
  {
    area: 'Inventory',
    pages: ['/inventory'],
    capabilities: [
      {
        action: 'See the register and its documents',
        page: '/inventory',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Any team’s, by anybody on a team. Somebody on no team sees none of it.',
      },
      {
        action: 'Add, edit or remove an item',
        key: 'inv.items',
        short: 'Items',
        can: granted('inv.items'),
        note: 'Its shelves and documents too.',
      },
      {
        action: 'Record stock movements and stock checks',
        key: 'inv.stock',
        short: 'Stock',
        can: granted('inv.stock'),
      },
      {
        action: 'Ask for something to be bought',
        key: 'inv.purchase_ask',
        short: 'Ask to buy',
        can: granted('inv.purchase_ask'),
        note: 'Anybody can withdraw their own request until it has been answered.',
      },
      {
        action: 'Approve, refuse or delete a purchase request',
        key: 'inv.purchase_decide',
        short: 'Decide purchases',
        can: granted('inv.purchase_decide'),
      },
    ],
  },
  {
    area: 'Messages, polls & updates',
    pages: ['/messages', '/team-chat', '/updates', '/polls', 'alerts'],
    capabilities: [
      {
        action: 'Read the message board',
        at: ['/messages'],
        page: '/messages',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'The church-wide board, for anybody on a team.',
      },
      {
        action: 'Post to the message board',
        key: 'msg.board_post',
        at: ['/messages'],
        short: 'Post',
        can: granted('msg.board_post'),
        note: '“Their team” is a post attached to one of their own teams. A church-wide post takes “Everywhere”.',
      },
      {
        action: 'Delete anybody’s message board post, or clear the board',
        key: 'msg.board_moderate',
        at: ['/messages'],
        short: 'Moderate the board',
        can: granted('msg.board_moderate'),
        note: 'Anybody can delete their own post.',
      },
      {
        action: 'Read and post in a team’s chat',
        key: 'msg.chat',
        at: ['/team-chat'],
        short: 'Chat',
        can: granted('msg.chat'),
        note: 'Your own teams only.',
      },
      {
        action: 'Delete anybody’s post in a team’s chat',
        key: 'msg.chat_moderate',
        at: ['/team-chat'],
        short: 'Moderate the chat',
        can: granted('msg.chat_moderate'),
        note: 'Anybody can edit or delete their own. Only the author ever edits a post: what somebody wrote stays theirs.',
      },
      {
        action: 'Ask a poll question, and change or remove anybody’s',
        key: 'msg.polls',
        at: ['/polls'],
        short: 'Ask polls',
        can: granted('msg.polls'),
        note: '“Their team” asks their own team, whole or only its people at one service. Asking everyone, or people by name, takes “Everywhere”. Anybody can change or remove a poll they asked.',
      },
      {
        action: 'See and answer a poll',
        at: ['/polls'],
        page: '/polls',
        can: all({
          owner: 'own',
          admin: 'own',
          head: 'own',
          coordinator: 'own',
          member: 'own',
          newcomer: 'own',
        }),
        note: 'Only the polls addressed to you — everyone, a team you are on, you by name, or a service the rota has you on. An Admin can see every poll.',
      },
      {
        action: 'Read the church updates',
        at: ['/updates'],
        page: '/updates',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
      },
      {
        action: 'Post, pin, edit or delete a church update',
        key: 'msg.updates',
        at: ['/updates'],
        short: 'Post updates',
        can: granted('msg.updates'),
        note: 'Posting tells everybody, in the app and on their phone. Never by email.',
      },
      {
        action: 'Send an alert to a team that reaches phones',
        key: 'msg.alert_team',
        at: ['/team-chat'],
        short: 'Alert a team',
        can: granted('msg.alert_team'),
        note: 'The one thing that puts author-written text on somebody’s lock screen.',
      },
      {
        action: 'Send an alert to the whole church, several teams, or named people',
        key: 'msg.alert',
        at: ['alerts'],
        short: 'Alert the church',
        can: granted('msg.alert'),
        note: 'From Settings › Send an Alert, which also keeps the record of what was sent.',
      },
    ],
  },
  {
    area: 'Issues',
    pages: ['/issues'],
    capabilities: [
      {
        action: 'Raise an issue seen at a service',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'For any team, under the service it was seen at, and only while that service is taking issues — from an hour before it starts until two hours after it ends (both in Settings › Page by Page). Heads, Assisting Heads and Admins can raise one at any time. Your name and the team you raise it as go on it, and the team it is for is told. Settings › Page by Page can open this to everyone signed in (Church Members too) or close it to Heads and Admins.',
      },
      {
        action: 'See the issues',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Every team’s. Church Members see them only when Settings › Page by Page lets everyone raise one.',
      },
      {
        action: 'Mark an issue resolved, not resolved or persistent, with remarks — or reopen it',
        key: 'issue.mark',
        short: 'Mark issues',
        can: granted('issue.mark'),
        note: 'Their name and remarks show on it.',
      },
      {
        action: 'Delete anybody’s issue',
        key: 'issue.delete',
        short: 'Delete issues',
        can: granted('issue.delete'),
        note: 'Whoever raised one can take it back until it has been marked. Resolved issues are deleted on their own after the number of days in Settings › Page by Page.',
      },
    ],
  },
  {
    area: 'Set lists',
    pages: ['/set-lists'],
    capabilities: [
      {
        action: 'See the set lists',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
      },
      {
        action: 'Write and change a set list',
        key: 'set.edit',
        short: 'Edit set lists',
        can: granted('set.edit'),
        note: '“Their team” is a worship team they are on.',
      },
    ],
  },
  {
    area: 'After the service',
    pages: ['/debriefs', '/'],
    capabilities: [
      {
        action: 'Read a team’s debrief',
        at: ['/debriefs'],
        page: '/debriefs',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Anybody on a team. It was readable by anybody signed in until 27 September 2026 (0109).',
      },
      {
        action: 'Write a team’s debrief, tick its points, and change any of them',
        key: 'debrief.manage',
        at: ['/debriefs'],
        short: 'Write the debrief',
        can: granted('debrief.manage'),
        note: 'At any time.',
      },
      {
        action: 'Add to a team’s debrief, and edit or remove their own points',
        key: 'debrief.contribute',
        at: ['/debriefs'],
        short: 'Add points',
        can: granted('debrief.contribute'),
        note: 'From when the service ends until the window in Settings › Page by Page closes. A point somebody else has ticked or assigned is not theirs to change.',
      },
      {
        action: 'See the activity feed',
        at: ['/'],
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Who was assigned and taken off, as it happens — the rota a line at a time, so it is closed to the same people the rota is (0109).',
      },
    ],
  },
  {
    area: 'Giving',
    pages: ['/giving'],
    capabilities: [
      {
        action: 'See how to give — bank details and giving links',
        page: '/giving',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'Every member. No payment passes through the app: a link opens the provider’s own page.',
      },
      {
        action: 'Change the Giving page',
        key: 'give.edit',
        short: 'Edit Giving',
        can: granted('give.edit'),
        note: 'In Settings › Giving.',
      },
    ],
  },
  {
    area: 'People',
    pages: ['/volunteers'],
    capabilities: [
      {
        action: 'See the roster — names, ages, birthdays and anniversaries',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'Birthdays and anniversaries are what Celebrations and the diary show, so anybody signed in can read them. Nothing else personal is.',
      },
      {
        action: 'See somebody’s email address and phone number',
        can: all({ admin: 'own', head: 'own', coordinator: 'own', member: 'own', newcomer: 'own' }),
        note: 'Everybody sees their own. Only the Owner sees anybody else’s — closed in the database itself (0127), not just hidden on the page, and left out of an Admin’s export. Marital status is closed the same way.',
      },
      {
        action: 'Edit your own profile',
        can: all({
          owner: 'own',
          admin: 'own',
          head: 'own',
          coordinator: 'own',
          member: 'own',
          newcomer: 'own',
        }),
      },
      {
        action: 'Edit somebody else’s profile',
        key: 'people.edit_others',
        short: 'Edit profiles',
        can: granted('people.edit_others'),
        note: 'Their picture too. Contact details, visa and DBS stay the Owner’s.',
      },
      {
        action: 'See visa, DBS and safeguarding details',
        can: all({ admin: 'own', head: 'own', coordinator: 'own', member: 'own', newcomer: 'own' }),
        note: 'Everybody sees their own. Only the Owner sees anybody else’s (0126) — not Admins, not team Heads.',
      },
      {
        action: 'Invite somebody to the app, and see who has been invited',
        key: 'people.invite',
        short: 'Invite',
        can: granted('people.invite'),
        note: '“Their team” invites to their own team. Inviting to no team at all needs any team they may invite to.',
      },
      {
        action: 'Clear old people records — accepted invitations, answered join requests',
        key: 'people.clear_records',
        short: 'Clear records',
        can: granted('people.clear_records'),
        note: 'They are kept until somebody clears them (0128). A request still waiting on a Head cannot be cleared.',
      },
      {
        action: 'Send the tour of the app to somebody, and see who has taken it',
        key: 'people.onboard',
        short: 'Send the tour',
        can: granted('people.onboard'),
        note: '“Their team” sends it to people on their own team. The tour itself is cut by the standing of whoever receives it.',
      },
      {
        action: 'Remove somebody’s account',
        key: 'people.remove',
        short: 'Remove accounts',
        can: granted('people.remove'),
        note: 'Only the Owner can remove another Admin. Nobody can remove the Owner.',
      },
    ],
  },
  {
    area: 'Clock in',
    pages: ['/clock-in'],
    capabilities: [
      {
        action: 'See the Clock In page and every clock-in',
        key: 'clockin.view',
        short: 'See clock-ins',
        can: granted('clockin.view'),
        note: 'Names, times and where each person was. The Owner always does, and Overwatch unless Settings › Overwatch closes it. Anybody else by name or through a team: Settings › Clock in, or By person.',
      },
    ],
  },
  {
    area: 'Stage Layout',
    pages: ['/stage'],
    fixed: 'Set per team rather than per profile: Settings › Stage Layout says which teams may add, edit, delete, comment and keep templates. Admins and the Owner always may.',
    capabilities: [
      {
        action: 'See a stage layout, its comments and its history',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'Follows the Stage Layout page’s rule on the Pages tab: everyone signed in, unless the church narrows it.',
      },
      {
        action: 'Add, move, rename, recolour, delete blocks; comment; apply a template',
        can: all({ head: 'no', coordinator: 'no', member: 'no' }),
        note: 'Given to teams, not profiles, in Settings › Stage Layout. Once a service has finished the layout is a record.',
      },
      {
        action: 'Keep a layout as a template',
        can: all({ head: 'no', coordinator: 'no', member: 'no' }),
        note: 'A team given Templates saves straight into the library. Anybody who may edit can ask instead; an Admin approves or declines, and is told by notification.',
      },
    ],
  },
  {
    area: 'Feedback',
    pages: ['/feedback'],
    fixed: 'Feedback is written to the Owner, so reading it stays the Owner’s.',
    capabilities: [
      {
        action: 'Send feedback about the app',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'A bug, an idea, an improvement, something confusing, praise. Church Members cannot. The Owner is told.',
      },
      {
        action: 'See your feedback, where it stands and the reply',
        can: all({ admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
      },
      {
        action: 'Take your feedback back',
        can: all({ admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
        note: 'Only while it is still New — once the Owner has picked it up, it stays.',
      },
      {
        action: 'Read everybody’s feedback, mark where it stands and reply',
        can: all({ admin: 'no' }),
        note: 'The Owner alone — Admins see only their own. The sender is told when the status or the reply changes.',
      },
    ],
  },
  {
    area: 'The app itself',
    pages: ['app'],
    fixed: 'Whoever could change these could hand themselves everything else, so they stay with the Owner and Admins.',
    capabilities: [
      { action: 'Grant or take away Admin', can: all() },
      { action: 'Make somebody a team Head', can: all() },
      { action: 'Change church settings and timings', can: all() },
      {
        action: 'Change who can do what — this grid',
        key: 'app.permissions',
        short: 'Permissions',
        can: granted('app.permissions'),
        note: 'The Owner and every Admin, always: it is how a wrong setting gets put right.',
      },
      {
        action: 'Arrange the menu — its groups, their names, and the order of pages',
        can: all(),
        note: 'In Settings › Menu, for everybody at once. It only moves pages; who can open each one is unchanged.',
      },
      {
        action: 'Hand over ownership',
        can: all({ admin: 'no' }),
        note: 'The Owner alone, and the person receiving it has to accept.',
      },
    ],
  },
]

/** The page standing each column is, for the purpose of opening pages. */
const COLUMN_STANDING: Record<RoleKey, Standing> = {
  owner: 'admin',
  admin: 'admin',
  head: 'lead',
  assistant: 'lead',
  coordinator: 'member',
  member: 'member',
  newcomer: 'church',
}

/**
 * The grid as this church has set it: every row tied to a page reads
 * "yes" for a standing the page is now open to, and "no" for one it is
 * closed to. A narrower answer that still holds ("own", "team") is kept,
 * because opening the page does not widen it.
 */
export function withPageAccess(access: PageAccess, issuesScope?: string): PermissionArea[] {
  return PERMISSIONS.map((area) => ({
    ...area,
    capabilities: area.capabilities.map((c) => {
      if (!c.page) return c
      const level = levelOf(c.page, access, issuesScope)
      const can = Object.fromEntries(
        (Object.keys(c.can) as RoleKey[]).map((role) => {
          const open = standingMayOpen(COLUMN_STANDING[role], level)
          const was = c.can[role]
          return [role, !open ? 'no' : was === 'no' ? 'yes' : was]
        }),
      ) as Record<RoleKey, Allowed>
      return { ...c, can }
    }),
  }))
}

/**
 * The grid as this church has set it: every row the church sets reads
 * what it chose rather than the app's default.
 */
export function withGrants(areas: PermissionArea[], overrides: Overrides): PermissionArea[] {
  return areas.map((area) => ({
    ...area,
    capabilities: area.capabilities.map((c) => (c.key ? { ...c, can: granted(c.key, overrides) } : c)),
  }))
}

/** An area the church can set, rather than one still waiting for its release. */
export function isLiveArea(area: PermissionArea): boolean {
  return area.capabilities.some((c) => isEditable(c))
}

/** A row with at least one cell the church can change. */
export function isEditable(c: Capability): boolean {
  const key = c.key
  return !!key && GRANT_ROLES.some((role) => !isFixed(key, role))
}

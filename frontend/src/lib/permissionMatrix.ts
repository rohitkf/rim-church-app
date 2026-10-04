/**
 * Who can do what, written down.
 *
 * This is a reference, not a control panel. The app's permissions are not
 * data: they are Row Level Security policies enforced by Postgres on every
 * query, which is precisely why they hold — a rule the database applies
 * cannot be talked out of it by a browser with devtools open. There is no
 * settings table for a checkbox on this page to write to, and there should
 * not be one.
 *
 * So this page says what the rules are. Changing them means changing a
 * policy, in a migration, on purpose.
 *
 * Every row below was read off `pg_policies` in the live database rather
 * than remembered, on the date in CHECKED_ON. It can still drift: nothing
 * makes a policy added next spring update this file. The page says so
 * rather than implying an accuracy it cannot promise.
 */

import { levelOf, standingMayOpen, type PageAccess, type Standing } from './pageAccess'

export const CHECKED_ON = '27 September 2026'

/** The standings a person can hold. Columns, left to right. */
export const ROLES = [
  {
    key: 'owner',
    label: 'Owner',
    blurb: 'The one account that cannot be removed, and the only one that can hand ownership on.',
  },
  { key: 'admin', label: 'Admin', blurb: 'Runs the church’s app. Everything below, everywhere.' },
  {
    key: 'head',
    label: 'Team Head',
    blurb: 'Head or Assisting Head — the two are the same in every rule. Their own team only.',
  },
  {
    key: 'coordinator',
    label: 'Coordinator',
    blurb: 'Whoever the rota puts in Team Coordinator, for that service only. Not a standing rank.',
  },
  {
    key: 'member',
    label: 'Team Member',
    blurb: 'On at least one team — and a Church Member too, as everybody signed in is.',
  },
  {
    key: 'newcomer',
    label: 'Church Member',
    blurb:
      'Signed in and on no team. They see the church’s shape — the services and the countdown, the diary, the set lists, the teams (to ask to join one) and the Giving page — and none of the teams’ own working: no rota, no register, no boards, no call times, no debriefs. Joining a team makes them a Team Member; an Admin can also make them a Head or an Admin from Volunteers.',
  },
] as const

export type RoleKey = (typeof ROLES)[number]['key']

/** Yes, no, or yes-but-only-your-own. */
export type Allowed = 'yes' | 'no' | 'own' | 'team'

export interface Capability {
  action: string
  /** Said out loud when the answer needs a sentence rather than a tick. */
  note?: string
  can: Record<RoleKey, Allowed>
  /**
   * The page whose "who can open it" setting decides this row (Settings ›
   * Access & privileges › Pages). The grid above is the app's defaults;
   * `withPageAccess` redraws these rows with the church's own choices.
   */
  page?: string
}

export interface PermissionArea {
  area: string
  capabilities: Capability[]
}

const all = (over: Partial<Record<RoleKey, Allowed>> = {}): Record<RoleKey, Allowed> => ({
  owner: 'yes',
  admin: 'yes',
  head: 'no',
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
    capabilities: [
      {
        action: 'See services and the running order',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'The church’s own shape, open to anybody signed in — it is what the countdown on the dashboard counts to.',
      },
      { action: 'Create, edit or delete a service', can: all() },
      { action: 'Build and edit service templates', can: all() },
      { action: 'Set session times and the run sheet', can: all() },
      {
        action: 'Add a guest to a service',
        can: all(),
        note: 'Guests are visible to everyone once added.',
      },
      {
        action: 'Set a service to repeat, or stop it repeating',
        can: all(),
        note: 'Each service a repeat makes is its own from then on: deleting one Sunday never touches the others.',
      },
      {
        action: 'See the church diary',
        page: '/events',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
      },
      {
        action: 'Add, edit or remove an event in the church diary',
        can: all({ head: 'team' }),
        note: 'A Head, for their own team’s events. A church-wide event, belonging to no team, is an Admin’s.',
      },
      {
        action: 'Set a team’s call time',
        can: all({ head: 'team' }),
        note: 'Anybody on a team can read every team’s — knowing Worship is called at eight is how whoever opens up knows who to expect. Somebody on no team reads none of them.',
      },
    ],
  },
  {
    area: 'Team rota',
    capabilities: [
      {
        action: 'See the rota',
        page: '/rota',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Anybody on a team sees every team’s Sunday. It was open to anybody signed in until September 2026.',
      },
      { action: 'Assign somebody to a role', can: all({ head: 'team' }) },
      {
        action: 'Tag an assignment — Shadow, and the church’s other tags',
        can: all({ head: 'team' }),
        note: 'A tag is a label, not an exemption: a shadow is still that person’s one role at the service.',
      },
      {
        action: 'Choose the rota’s tags and the Coordinator’s colour',
        can: all(),
        note: 'In Settings › Team Rota.',
      },
      { action: 'Ask another team to release a volunteer', can: all({ head: 'team' }) },
      { action: 'Approve or refuse a release request', can: all({ head: 'team' }) },
      { action: 'Delete a release request outright', can: all() },
    ],
  },
  {
    area: 'Teams & roles',
    capabilities: [
      {
        action: 'See teams, their roles and their checklists',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'How the church is organised is not private: it is how somebody new finds the team to ask to join.',
      },
      {
        action: 'See who heads a team, and who assists',
        can: all({ head: 'yes', coordinator: 'yes', member: 'team' }),
        note: 'Your own teams. Until September 2026 only an Admin could see this, so the roster showed no Head at all to the people on it.',
      },
      { action: 'Create or delete a team', can: all() },
      { action: 'Rename a team, set its colour or handbook', can: all({ head: 'team' }) },
      { action: 'Add or remove team members', can: all({ head: 'team' }) },
      { action: 'Add, rename or reorder roles', can: all({ head: 'team' }) },
      { action: 'Group roles, and file roles into groups', can: all({ head: 'team' }) },
      { action: 'Write a role’s standing checklist', can: all({ head: 'team' }) },
      { action: 'See and answer requests to join a team', can: all({ head: 'team' }) },
    ],
  },
  {
    area: 'On the day',
    capabilities: [
      {
        action: 'See your own checklist and tick it off',
        can: all({ head: 'own', coordinator: 'own', member: 'own' }),
        note: 'From your team’s call time on the day of the service until the service finishes — not before. The “After the service” half stays open for a while after the end (two hours unless Settings › Timings says otherwise), because that is when it is done. A box ticked at home says nothing about whether the thing was done. An Admin can put a service right either side of that.',
      },
      {
        action: 'Verify a team’s checklist as done',
        can: all({ head: 'team', coordinator: 'team' }),
        note: 'The Coordinator is why a Sunday does not stall on whoever happens to be in the building. The same window applies: nobody verifies before the call time.',
      },
      {
        action: 'Mark a team ready for the service (the green light)',
        can: all({ head: 'team', coordinator: 'team' }),
        note: 'The team’s Head or Assisting Head, or whoever the rota puts in Team Coordinator for it at that service. From the team’s call time on the day of the service — before then the switch is shown but held — until the service finishes. An Admin can change it at any time. Anybody on a team sees the lights.',
      },
      { action: 'Record attendance for a team', can: all({ head: 'team' }) },
      { action: 'Nudge somebody who has not finished', can: all({ head: 'team' }) },
    ],
  },
  {
    area: 'Availability',
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
        action: 'Change somebody else’s answer',
        can: all({ head: 'team' }),
        note: 'For the phone call that says “put me down, I forgot”.',
      },
      {
        action: 'Ask to change your answer after it has closed',
        can: all({ owner: 'own', admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
        note: 'Your own team’s Head approves or refuses it.',
      },
      {
        action: 'Approve or refuse a late change',
        can: all({ head: 'team' }),
      },
    ],
  },
  {
    area: 'Inventory',
    capabilities: [
      {
        action: 'See the register and its documents',
        page: '/inventory',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Any team’s, by anybody on a team. Somebody on no team sees none of it.',
      },
      { action: 'Add, edit or remove an item', can: all({ head: 'yes' }) },
      { action: 'Record stock movements and stock checks', can: all({ head: 'yes' }) },
      {
        action: 'Ask for something to be bought',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Anybody on a team can raise a request.',
      },
      { action: 'Approve or refuse a purchase request', can: all({ head: 'yes' }) },
      {
        action: 'Delete a purchase request',
        can: all({ head: 'yes', coordinator: 'own', member: 'own' }),
        note: 'Your own, while nobody has answered it yet. A Head or Admin, at any point.',
      },
    ],
  },
  {
    area: 'Messages, polls & updates',
    capabilities: [
      {
        action: 'Read the message board',
        page: '/messages',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'The church-wide board, for anybody on a team.',
      },
      {
        action: 'Post to the message board',
        can: all({ head: 'team', coordinator: 'team', member: 'team' }),
        note: 'A post is attached to one of your own teams. An Admin can post for any of them.',
      },
      { action: 'Delete a message board post', can: all() },
      {
        action: 'Read and post in a team’s chat',
        can: all({ head: 'team', coordinator: 'team', member: 'team' }),
        note: 'Your own teams only.',
      },
      {
        action: 'Ask a poll question',
        can: all({ head: 'team' }),
        note: 'A Head asks their own team, whole or only its people at one service. Asking everyone, or people by name, is an Admin’s.',
      },
      {
        action: 'See and answer a poll',
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
        page: '/updates',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
      },
      {
        action: 'Post, pin, edit or delete a church update',
        can: all(),
        note: 'Posting tells everybody, in the app and on their phone. Never by email.',
      },
      {
        action: 'Send an alert that reaches phones',
        can: all({ head: 'team' }),
        note: 'The one thing that puts author-written text on somebody’s lock screen.',
      },
      {
        action: 'Send that alert to the whole church, or to named people',
        can: all({}),
        note: 'A head can interrupt their own team. Reaching past it — everybody, several teams, three people by name — is an Admin’s, from Settings.',
      },
    ],
  },
  {
    area: 'Issues',
    capabilities: [
      {
        action: 'Raise an issue seen at a service',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'For any team, under the service it was seen at, and only while that service is taking issues — from an hour before it starts until two hours after it ends (both in Settings › Timings). Heads, Assisting Heads and Admins can raise one at any time. Your name and the team you raise it as go on it, and the team it is for is told. Settings › Timings can open this to everyone signed in (Church Members too) or close it to Heads and Admins.',
      },
      {
        action: 'See the issues',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Every team’s. Church Members see them only when Settings › Timings lets everyone raise one.',
      },
      {
        action: 'Mark an issue resolved, not resolved or persistent, with remarks — or reopen it',
        can: all({ head: 'team' }),
        note: 'A Head or Assisting Head of the team it is for. Their name and remarks show on it.',
      },
      {
        action: 'Delete an issue',
        can: all({ head: 'own', coordinator: 'own', member: 'own' }),
        note: 'Whoever raised it, until a Head has marked it — after that only an Admin. Resolved issues are deleted on their own after the number of days in Settings › Timings; not resolved and persistent ones stay until they are resolved.',
      },
    ],
  },
  {
    area: 'Set lists',
    capabilities: [
      {
        action: 'See the set lists',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
      },
      {
        action: 'Write and change a set list',
        can: all({ head: 'team', coordinator: 'team', member: 'team' }),
        note: 'Anybody on the worship team, whatever their rank on it.',
      },
    ],
  },
  {
    area: 'After the service',
    capabilities: [
      {
        action: 'Read a team’s debrief',
        page: '/debriefs',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Anybody on a team. It was readable by anybody signed in until 27 September 2026 (0109).',
      },
      {
        action: 'Write a team’s debrief, tick its points, and change any of them',
        can: all({ head: 'team' }),
        note: 'Whoever runs the team, at any time.',
      },
      {
        action: 'Add to their own team’s debrief, and edit or remove their own points',
        can: all({ head: 'team', coordinator: 'team', member: 'team' }),
        note: 'Anybody on the team, from when the service ends until 12 hours after (Settings › Timings). A point a Head has ticked or assigned is the Head’s to change.',
      },
      {
        action: 'See the activity feed',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'Who was assigned and taken off, as it happens — the rota a line at a time, so it is closed to the same people the rota is (0109).',
      },
    ],
  },
  {
    area: 'Giving',
    capabilities: [
      {
        action: 'See how to give — bank details and giving links',
        page: '/giving',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'Every member. No payment passes through the app: a link opens the provider’s own page.',
      },
      { action: 'Change the Giving page', can: all(), note: 'In Settings › Giving.' },
    ],
  },
  {
    area: 'People',
    capabilities: [
      {
        action: 'See the roster and contact details',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'yes' }),
        note: 'Names, emails, phone numbers, birthdays and anniversaries are readable by anybody signed in — a Church Member included — through the app’s data connection, even where no page shows them. Only DBS and safeguarding details are closed. Worth a decision.',
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
      { action: 'Edit somebody else’s profile', can: all() },
      {
        action: 'See DBS and safeguarding details',
        can: all({ head: 'own', coordinator: 'own', member: 'own', newcomer: 'own' }),
        note: 'Everybody sees their own. Only an Admin sees anybody else’s — leading a team is not a reason to read somebody’s safeguarding record.',
      },
      { action: 'Invite somebody to the app', can: all({ head: 'team' }) },
      { action: 'See who has been invited', can: all({ head: 'team' }) },
      {
        action: 'Remove somebody’s account',
        can: all(),
        note: 'Only the Owner can remove another Admin. Nobody can remove the Owner.',
      },
    ],
  },
  {
    area: 'Feedback',
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
    capabilities: [
      { action: 'Grant or take away Admin', can: all() },
      { action: 'Make somebody a team Head', can: all() },
      { action: 'Change church settings and timings', can: all() },
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

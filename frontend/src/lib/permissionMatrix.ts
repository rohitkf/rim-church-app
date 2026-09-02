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

export const CHECKED_ON = '2 September 2026'

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
  { key: 'member', label: 'Team Member', blurb: 'Everybody else who is signed in.' },
] as const

export type RoleKey = (typeof ROLES)[number]['key']

/** Yes, no, or yes-but-only-your-own. */
export type Allowed = 'yes' | 'no' | 'own' | 'team'

export interface Capability {
  action: string
  /** Said out loud when the answer needs a sentence rather than a tick. */
  note?: string
  can: Record<RoleKey, Allowed>
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
  ...over,
})

export const PERMISSIONS: PermissionArea[] = [
  {
    area: 'Services & planning',
    capabilities: [
      {
        action: 'See services and the running order',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
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
        action: 'Add an event to the church diary',
        can: all({ head: 'yes' }),
      },
      { action: 'Set a team’s call time', can: all({ head: 'yes' }) },
    ],
  },
  {
    area: 'Team rota',
    capabilities: [
      {
        action: 'See the rota',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
        note: 'The whole church can see who is serving when.',
      },
      { action: 'Assign somebody to a role', can: all({ head: 'team' }) },
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
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
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
      },
      {
        action: 'Verify a team’s checklist as done',
        can: all({ head: 'team', coordinator: 'team' }),
        note: 'The Coordinator is why a Sunday does not stall on whoever happens to be in the building.',
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
    ],
  },
  {
    area: 'Inventory',
    capabilities: [
      {
        action: 'See the register and its documents',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
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
    area: 'Messages & polls',
    capabilities: [
      {
        action: 'Read the message board',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
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
      { action: 'Ask a team a poll question', can: all({ head: 'team' }) },
      {
        action: 'Vote in a poll',
        can: all({ owner: 'own', admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
      },
      {
        action: 'Send an alert that reaches phones',
        can: all({ head: 'team' }),
        note: 'The one thing that puts author-written text on somebody’s lock screen.',
      },
    ],
  },
  {
    area: 'People',
    capabilities: [
      {
        action: 'See the roster and contact details',
        can: all({ head: 'yes', coordinator: 'yes', member: 'yes' }),
      },
      {
        action: 'Edit your own profile',
        can: all({ owner: 'own', admin: 'own', head: 'own', coordinator: 'own', member: 'own' }),
      },
      { action: 'Edit somebody else’s profile', can: all() },
      {
        action: 'See DBS and safeguarding details',
        can: all({ head: 'own', coordinator: 'own', member: 'own' }),
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
    area: 'The app itself',
    capabilities: [
      { action: 'Grant or take away Admin', can: all() },
      { action: 'Make somebody a team Head', can: all() },
      { action: 'Change church settings and timings', can: all() },
      {
        action: 'Hand over ownership',
        can: all({ admin: 'no' }),
        note: 'The Owner alone, and the person receiving it has to accept.',
      },
    ],
  },
]

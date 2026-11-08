/*
 * What is new, said once.
 *
 * When something lands that people would otherwise find by accident — a
 * new page, a changed habit — the app says so the next time each person
 * opens it: one card, a few lines, a button to go and look. Once per
 * account (`onboarding.releases_seen`, 0156), so it follows them to a new
 * phone and never comes back on the old one.
 *
 * A release is data, newest first. The key is what the database
 * remembers, so it never changes once shipped; the words can.
 */

export interface Release {
  /** Stable, lower-case, never reused. */
  key: string
  /** When it shipped, for the card's corner. */
  date: string
  title: string
  /** One line under the title. */
  lead: string
  /** What it does, in a handful of short lines. */
  points: string[]
  /** Where to go and see it. */
  link?: { to: string; label: string }
  /** Only for people who may open this page; others are not told about a door they have no key to. */
  page?: string
}

export const RELEASES: Release[] = [
  {
    key: 'during-the-service-checklist',
    date: '2026-11-08',
    title: 'During the service',
    lead: 'A third part to every role’s checklist, between before and after.',
    points: [
      'A Team Head adds lines under “During the service” on a role’s checklist, under Teams.',
      'They open when the service starts, and count in readiness like the rest.',
      'On the rota, a role can be given before, during and after — or only some of them.',
    ],
    link: { to: '/checklists', label: 'Open Checklists' },
    page: '/checklists',
  },
  {
    key: 'optional-checklist-lines',
    date: '2026-11-08',
    title: 'Optional checklist lines',
    lead: 'A job worth writing down that is not owed every Sunday.',
    points: [
      'A Team Head can mark any line on a role’s checklist as optional, under Teams.',
      'An optional line does not count towards readiness until the person on that role ticks it.',
      'Once ticked, it counts like any other line — verified, signed off, and in the team’s percentage.',
    ],
    link: { to: '/checklists', label: 'Open Checklists' },
    page: '/checklists',
  },
  {
    key: 'reception',
    date: '2026-11-04',
    title: 'Reception',
    lead: 'The door, on one page.',
    points: [
      'Scan tickets: a paid one is checked in on sight; one that still owes is held up, and can be paid there and then.',
      'Find anybody by name and check them in, or register somebody who turns up having done nothing online.',
      'Only for whoever is given “Work the door” or “Run registrations” in Access & Privileges.',
    ],
    link: { to: '/door', label: 'Open Reception' },
    page: '/door',
  },
  {
    key: 'registrations',
    date: '2026-11-03',
    title: 'Registrations',
    lead: 'Events anybody can sign up for from a link — no account needed.',
    points: [
      'Make an event with a picture, dates, free, paid or donation tickets, promo codes and a map.',
      'Share its link. People register with a name, email and phone, and get a ticket with a QR code.',
      'See who has registered and who has paid, and mark payments as they arrive.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'clock-in',
    date: '2026-10-27',
    title: 'Clock in when you arrive',
    lead: 'On a day you serve, a CLOCK IN button appears on your Dashboard a few minutes before your call time.',
    points: [
      'Press it at church: your phone is read once, there and then, and you are marked Present on your teams.',
      'Allow location when the app asks, so it is ready on the day. It is never read in the background.',
      'If your phone will not place you at church, ask to be clocked in instead — an approver will answer.',
    ],
  },
  {
    key: 'talk-on-your-phone',
    date: '2026-10-25',
    title: 'Board posts and team chat on your phone',
    lead: 'A new post on the message board, or a message in one of your teams’ chats, now reaches your phone.',
    points: [
      'Who posted and what they said, the newest replacing the last — so the bell holds one line per room, not fifty.',
      'Mentions and team alerts come through as before.',
      'Too much? Turn either off in Settings › Appearance › Phone notifications. The bell keeps them.',
    ],
  },
  {
    key: 'stage-layout',
    date: '2026-10-17',
    title: 'Stage Layout',
    lead: 'Where everything and everybody stands on the morning, drawn once so the whole band sees the same picture.',
    points: [
      'One picture per service: the stage, the hall and any area the church names, in one workspace.',
      'Drag blocks where they go, resize them, put a person on each. Rows of seats for the hall.',
      'Tap a block to see who placed it and who last moved it. Comments, pinned notes and a full history.',
      'Keep a layout as a template for next time. Layouts of past services clear each Tuesday.',
    ],
    link: { to: '/stage', label: 'Open Stage Layout' },
    page: '/stage',
  },
]

/** The newest release this person has not been told about and may open, or null. */
export function nextUnseenRelease(
  seen: Record<string, string>,
  canOpen: (page: string) => boolean,
  releases: Release[] = RELEASES,
): Release | null {
  return releases.find((r) => !(r.key in seen) && (!r.page || canOpen(r.page))) ?? null
}

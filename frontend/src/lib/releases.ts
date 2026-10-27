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

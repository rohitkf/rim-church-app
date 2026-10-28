import type { Standing } from './pageAccess'
import { ROLE_NAME } from './roleNames'

/*
 * The tour: the app, walked page by page, in chapters cut by standing.
 *
 * A new account used to get three welcome cards and then the whole app at
 * once. Now the welcome is the first chapter of a tour that goes to each
 * page and points at the thing it is talking about, and the chapters are
 * cut the way the app is: what a Church Member can open, what a team's
 * pages add, what a Head gets to control, what an Admin runs, and the
 * handful of things that are the Owner's alone. A person is shown the
 * chapters of their standing that they have not seen — so somebody put on
 * a team is shown the team's pages the next time they open the app, and
 * nothing they have already been walked through.
 *
 * What has been seen is on the account (0153), not in the browser. An
 * Admin can send the tour again, to everybody or to a few, and a chapter
 * seen before that send is due again.
 *
 * The content is here, as data, so adding a page to the app means adding
 * a step here — and the tests hold every step to a page that exists.
 */

export type TourStanding = Standing | 'owner'

/** Lowest first: a standing is shown its own chapters and every one below. */
export const TOUR_LADDER: readonly TourStanding[] = ['church', 'member', 'lead', 'admin', 'owner']

export const TOUR_STANDING_LABEL: Record<TourStanding, string> = {
  church: ROLE_NAME.newcomer,
  member: ROLE_NAME.member,
  lead: ROLE_NAME.head,
  admin: ROLE_NAME.admin,
  owner: ROLE_NAME.owner,
}

/** What the steps may ask about the person in front of the screen. */
export interface TourContext {
  firstName: string
  onATeam: boolean
  /** Whether a page is open to them (Settings › Access & Privileges › Pages). */
  canOpen: (path: string) => boolean
  /** Whether a Settings room is theirs to enter (lib/settingsSections' maySee). */
  roomOpen: (path: string) => boolean
}

export interface TourStep {
  /** The page it is shown on. */
  path: string
  /**
   * The `data-tour` anchor on that page to point at. `page-title` is every
   * page's header. None at all means a card in the middle of the screen,
   * for the beats that are about the app rather than a part of it.
   */
  target?: string
  title: string
  body: string
  /** Shown only when this is true of the person. */
  when?: (ctx: TourContext) => boolean
  /** The "three things a Sunday is made of" list, under the body. */
  list?: 'sunday'
}

export interface TourChapter {
  key: string
  standing: TourStanding
  title: string
  steps: TourStep[]
}

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    key: 'welcome',
    standing: 'church',
    title: 'Welcome',
    steps: [
      {
        path: '/',
        title: 'Welcome.',
        body: 'This is where Sunday is put together: who is serving, when they are in, and what has to be ready before the doors open. This tour walks you round in a couple of minutes. Next moves on; Skip lets you skip a part, or all of it.',
      },
      {
        path: '/',
        title: 'How a Sunday works here',
        body: 'Three things, and that is all of it.',
        list: 'sunday',
      },
    ],
  },
  {
    key: 'around',
    standing: 'church',
    title: 'Finding your way',
    steps: [
      {
        path: '/',
        target: 'dock',
        title: 'The dock',
        body: 'Every page is here. On a phone it shows three at a time and slides along as you move; More holds the rest, and pressing and holding More gives you a quick menu.',
      },
      {
        path: '/',
        target: 'search',
        title: 'Search anything',
        body: 'A page, a person, a song. On a keyboard, Ctrl K.',
      },
      {
        path: '/',
        target: 'bell',
        title: 'What wants you',
        body: 'The bell collects anything that needs you: a team waiting on an answer, a poll, a message. Tap one and it takes you there.',
      },
      {
        path: '/',
        target: 'account',
        title: 'Your account',
        body: 'Your profile, how the app looks, and sign out.',
      },
      {
        path: '/',
        target: 'page-title',
        title: 'The dashboard',
        body: 'The next service and the countdown to it, what is coming up, and whatever is waiting on you. It fills out as you do more here.',
      },
    ],
  },
  {
    key: 'church',
    standing: 'church',
    title: 'What’s on',
    steps: [
      {
        path: '/service-planner',
        target: 'page-title',
        title: 'Service Planner',
        body: 'The running order of each service, session by session, and who is coordinating it.',
      },
      {
        path: '/events',
        target: 'page-title',
        title: 'Events',
        body: 'Birthdays, anniversaries, services and church events, in one diary.',
      },
      {
        path: '/updates',
        target: 'page-title',
        title: 'Church Updates',
        body: 'News from the church, and anything it wants everybody to read.',
      },
      {
        path: '/polls',
        target: 'page-title',
        title: 'Polls',
        body: 'When the church asks a question, it lands here. One tap to answer.',
      },
      {
        path: '/stage',
        target: 'page-title',
        title: 'Stage Layout',
        body: 'Where everything and everybody stands on the morning, drawn once so the whole band sees the same picture. Tap a block to see who placed it.',
      },
      {
        path: '/giving',
        target: 'page-title',
        title: 'Giving',
        body: 'Tithes and offerings: how to give, and where it goes.',
      },
      {
        path: '/feedback',
        target: 'page-title',
        title: 'Feedback',
        body: 'Something wrong with the app, or something you wish it did? Tell the people who run it.',
      },
      {
        path: '/settings/profile',
        target: 'page-title',
        title: 'Your profile',
        body: 'Your name, birthday and anniversary, your DBS and visa, your family. Changes save on their own.',
      },
      {
        path: '/departments',
        target: 'join-team',
        title: 'Find your team',
        body: 'The rest of the app belongs to the teams: the rota, the checklists, the boards. Ask to join yours and your head will let you in.',
        when: (ctx) => !ctx.onATeam,
      },
    ],
  },
  {
    key: 'serving',
    standing: 'member',
    title: 'Your Sunday',
    steps: [
      {
        path: '/availability',
        target: 'serving-tabs',
        title: 'Serving, in three steps',
        body: 'Say if you can serve, see who was put on, tick off what is yours on the day. Serving in the dock opens on whichever step is waiting for you.',
      },
      {
        path: '/availability',
        target: 'page-title',
        title: 'Can you serve?',
        body: 'One tap per service, for each team you are on. Answers close the night before, and your head builds the rota from them.',
      },
      {
        path: '/rota',
        target: 'page-title',
        title: 'Team Rota',
        body: 'Who is doing what. Your call time comes with your role, and the dashboard counts down to it.',
      },
      {
        path: '/checklists',
        target: 'page-title',
        title: 'Checklists',
        body: 'Your role’s list for the day. It opens at your call time, and a packing-up list opens near the end of the service.',
      },
    ],
  },
  {
    key: 'team',
    standing: 'member',
    title: 'Your team',
    steps: [
      {
        path: '/departments',
        target: 'page-title',
        title: 'Teams',
        body: 'Your team’s page has its roster, its handbook and the kit it looks after. Other teams’ pages show who is on them.',
      },
      {
        path: '/set-lists',
        target: 'page-title',
        title: 'Set Lists',
        body: 'The songs for each service, in order, with their keys.',
      },
      {
        path: '/inventory',
        target: 'page-title',
        title: 'Inventory',
        body: 'What each team looks after. Borrow something, bring it back, and say when something needs buying.',
      },
      {
        path: '/debriefs',
        target: 'page-title',
        title: 'Debriefs',
        body: 'In the hours after a service, say how it went for your team. Your head reads it, and it is gone in a fortnight.',
      },
      {
        path: '/issues',
        target: 'page-title',
        title: 'Issues',
        body: 'Something a team has to put right: a cable, a light, a slide. Raise it and that team hears about it.',
      },
    ],
  },
  {
    key: 'talk',
    standing: 'member',
    title: 'Talking',
    steps: [
      {
        path: '/messages',
        target: 'board-composer',
        title: 'Message Board',
        body: 'Everybody on a team reads this. @ somebody to mention them, and they are told.',
      },
      {
        path: '/team-chat',
        target: 'page-title',
        title: 'Team Chat',
        body: 'Just your team. Each team has its own.',
      },
    ],
  },
  {
    key: 'leading',
    standing: 'lead',
    title: 'Leading a team',
    steps: [
      {
        path: '/rota',
        target: 'rota-assign',
        title: 'Build the rota',
        body: 'Give a role to each person who said they can serve. Borrowing somebody from another team needs their head’s approval.',
      },
      {
        path: '/availability',
        target: 'page-title',
        title: 'Chase the answers',
        body: 'The tracker shows who has not answered yet. Remind them with one tap, and approve a change somebody asks for after answers close.',
      },
      {
        path: '/checklists',
        target: 'ready-light',
        title: 'Ready for service',
        body: 'Mark your team ready on the morning, and remind whoever has not finished their list.',
      },
      {
        path: '/departments',
        target: 'page-title',
        title: 'Your team’s page',
        body: 'Join requests land here for you to answer. Set the team’s roles and each role’s checklist, upload the handbook, and invite somebody straight onto the team.',
      },
      {
        path: '/settings/alerts',
        target: 'page-title',
        title: 'Send an Alert',
        body: 'Interrupt your team when something cannot wait. It goes to their phones, not just the board.',
      },
    ],
  },
  {
    key: 'running',
    standing: 'admin',
    title: 'Running the app',
    steps: [
      {
        path: '/settings',
        target: 'page-title',
        title: 'Settings',
        body: 'The church’s set-up lives here, room by room.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/access',
        title: 'Access & Privileges',
        body: 'Who can open each page, and who can do what. Every row is the church’s to change, and the database enforces what is chosen.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/pages',
        title: 'Page by Page',
        body: 'Every page’s clocks and what it keeps — when answers close, when checklists open, how long things stay — and who may do what on it, team by team.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/menu',
        title: 'Menu',
        body: 'Arrange the More menu for everybody: the order, the groups.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/onboarding',
        title: 'Onboarding',
        body: 'Send this tour to anybody, everyone at once or a few. It opens for them the next time they open the app.',
      },
      {
        path: '/volunteers',
        target: 'people-invite',
        title: 'Volunteers',
        body: 'Everybody with an account. Invite people, make somebody a Head or an Admin, and export the roster.',
      },
      {
        path: '/departments',
        target: 'page-title',
        title: 'Teams',
        body: 'Create a team, name its head, and set what it looks after.',
      },
      {
        path: '/',
        target: 'account',
        title: 'View as',
        body: 'From your account menu, see the app as a Church Member, a Team Member or a Head would: the same pages, the same menu, nothing more.',
      },
    ],
  },
  {
    key: 'owner',
    standing: 'owner',
    title: 'The Owner’s keys',
    steps: [
      {
        path: '/volunteers',
        target: 'people-export',
        title: 'The contact book',
        body: 'Only you see email addresses, phone numbers, visa and DBS details and families, on the page and in the export.',
      },
      {
        path: '/volunteers',
        target: 'page-title',
        title: 'Ownership',
        body: 'Only you can take Admin away from somebody, and only you can hand the app to somebody else. Both are on a person’s row.',
      },
      {
        path: '/feedback',
        target: 'page-title',
        title: 'Everyone’s feedback',
        body: 'What people tell the app lands with you, to answer or to mark done.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/logo',
        title: 'The app’s mark',
        body: 'The logo at the top of every page.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/data',
        title: 'Erase Data',
        body: 'The one that empties the diary. It asks twice, and it is yours alone.',
      },
    ],
  },
]

export const TOUR_CHAPTER_KEYS = TOUR_CHAPTERS.map((c) => c.key)

/** The tour's view of somebody: the page standing, with the Owner on top. */
export function tourStandingOf(who: { isOwner: boolean; standing: Standing }): TourStanding {
  return who.isOwner ? 'owner' : who.standing
}

/** Every chapter of this standing and the standings below it, in order. */
export function chaptersFor(standing: TourStanding): TourChapter[] {
  const rank = TOUR_LADDER.indexOf(standing)
  return TOUR_CHAPTERS.filter((c) => TOUR_LADDER.indexOf(c.standing) <= rank)
}

/** The room a step is about, when it is about one: its page, or the hall tile it points at. */
function roomOf(step: TourStep): string | null {
  if (step.target?.startsWith('settings:')) return step.target.slice('settings:'.length)
  if (step.path.startsWith('/settings/')) return step.path
  return null
}

/**
 * The steps of a chapter this person would actually see: on pages they
 * may open, in rooms they may enter, and true of them.
 */
export function stepsOf(chapter: TourChapter, ctx: TourContext): TourStep[] {
  return chapter.steps.filter((s) => {
    if (!ctx.canOpen(s.path)) return false
    const room = roomOf(s)
    if (room && !ctx.roomOpen(room)) return false
    return !s.when || s.when(ctx)
  })
}

/** What has been seen: chapter key -> when, as the database stores it. */
export type SeenChapters = Record<string, string>

/**
 * The chapters still owed: never seen, or seen before the tour was last
 * sent to this person.
 */
export function dueChapters(
  chapters: TourChapter[],
  seen: SeenChapters,
  pushedAt: string | null | undefined,
): TourChapter[] {
  const since = pushedAt ? Date.parse(pushedAt) : null
  return chapters.filter((c) => {
    const at = seen[c.key]
    if (!at) return true
    return since !== null && Date.parse(at) < since
  })
}

/* ---- The one tour that can be running ---- */

export interface TourRun {
  /** Increments each time one starts, so the engine starts afresh. */
  id: number
  chapters: TourChapter[]
  /** Started by the app because it was due, or by the person asking. */
  mode: 'auto' | 'manual'
}

let run: TourRun | null = null
let nextId = 1
const listeners = new Set<(run: TourRun | null) => void>()

const emit = () => {
  for (const listener of listeners) listener(run)
}

export function startTour(chapters: TourChapter[], mode: TourRun['mode']): void {
  if (chapters.length === 0) return
  run = { id: nextId++, chapters, mode }
  emit()
}

export function endTour(): void {
  run = null
  emit()
}

export function currentTour(): TourRun | null {
  return run
}

export function subscribeTour(listener: (run: TourRun | null) => void): () => void {
  listeners.add(listener)
  listener(run)
  return () => {
    listeners.delete(listener)
  }
}

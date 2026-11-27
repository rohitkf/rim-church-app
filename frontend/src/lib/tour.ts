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
 * One chapter is cut by a right instead of a standing: Registrations and
 * Reception open to whoever the grid names, a Church Member working the
 * door as much as the Owner; Families and DBS Checks (0326, 0327) to the
 * Owner, a Pastor and whoever is given them. It sits at the bottom of the ladder, so
 * everybody is offered it, and its steps are on pages only its people may
 * open — so nobody else is shown it, and somebody given the door next
 * month is walked round it then.
 *
 * What has been seen is on the account (0153), not in the browser. An
 * Admin can send the tour again, to everybody or to a few, and a chapter
 * seen before that send is due again.
 *
 * The content is here, as data, so adding a page to the app means adding
 * a step here — and the tests hold every step to a page that exists, and
 * every page in the menu and every room of Settings to a step. A step is
 * a sentence about what is on the screen now: when a page changes what it
 * does, its sentence changes in the same commit (AGENTS.md §5).
 *
 * A chapter's key is what the account remembers, so it never changes. A
 * step added to a chapter people have seen is met by new accounts, and by
 * everybody when the tour is next sent; a new chapter is shown to
 * everybody who has steps in it, once, the next time they open the app.
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
  /** The page it is about: whoever may not open it is not shown the step. */
  path: string
  /**
   * Where it is shown, when that page is reached from inside another: the
   * services, planned from the Calendar. Used when the person may open
   * that other page; otherwise the step is shown on `path` itself.
   */
  at?: string
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
        body: 'A page, a person, a song, a piece of kit, a line somebody wrote. A few letters will do, in any order, and a slip of the thumb still finds it. Choosing a person opens them; choosing a song opens the song. What you chose last is offered first next time. On a keyboard, Ctrl K.',
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
        body: 'Your profile, how the app looks, this tour again whenever you want it, and sign out.',
      },
      {
        path: '/',
        target: 'page-title',
        title: 'The dashboard',
        body: 'The next service and the countdown to it, what is coming up, this week’s birthdays and anniversaries, and whatever is waiting on you. While a service is running, its card says what is on now, who is taking it and how long it has left.',
      },
      {
        path: '/',
        target: 'at-church',
        title: 'Am I at church?',
        body: 'Under the date: green when your phone is at church, red when it is not. Tap it to see how far. It needs location allowed — if it says Location blocked, tap it and press Allow location, and it shows the steps for your phone.',
      },
      {
        path: '/',
        target: 'notices',
        title: 'A notice from the church',
        body: 'When the church has something everybody should know, it is a line across the top of every page for as long as it is true. Nothing buzzes and nothing needs pressing. A notice about maintenance says when the app will be closed, before it is.',
      },
    ],
  },
  {
    key: 'church',
    standing: 'church',
    title: 'What’s on',
    steps: [
      {
        path: '/events',
        target: 'page-title',
        title: 'Calendar',
        body: 'Birthdays, anniversaries, services, church events and the meetings that happen every week or month, in one diary. It shows a screen at a time; Show more brings the rest. The chips under the month choose what is shown, and Add to calendar starts a new service, event or regular meeting for whoever may add one.',
      },
      {
        path: '/service-planner',
        at: '/events?show=service',
        target: 'services',
        title: 'Planning a service',
        body: 'Services, on the Calendar, is where services are planned: today’s, the next, what is coming and what has finished. Opening one gives its running order, with links under its name to that service’s rota, set list, stage layout and the rest, each opening on that service. The running order goes session by session, who is taking each, who stands in, who translates and who is coordinating it. A session can carry a note for everybody who reads it, which goes onto the exported sheet too. Whoever plans it can drag the names on a session into order, and whoever may open the Countdown has a button to it on the running order. A service can carry a link, to its stream or its notes, and while it runs the clock there keeps time with the Dashboard and Countdown. Under its title it says when availability answers close for that service; whoever manages services can give one service a deadline of its own there.',
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
        body: 'When the church asks a question, it lands here. One tap to answer, and Share hands somebody the link to that poll.',
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
        path: '/prayer',
        target: 'page-title',
        title: 'Prayer Requests',
        body: 'Ask the church to pray, or ask the pastors alone, privately. Press Praying or Prayed on somebody’s request, and when a prayer is answered, share the testimony.',
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
        body: 'Your name, birthday and anniversary, your DBS and visa, your address and family, and who to ring for you in an emergency. Everybody is asked for these, and changes save on their own. If you have one name only, tick the box under your name and no last name is asked for. If you have a DBS check, its card asks for the certificate’s details and your permission to check it, has its own Save, and says once it has been verified.',
      },
      {
        path: '/settings/account',
        target: 'page-title',
        title: 'Your account',
        body: 'Your own data, in your own hands. Download a copy of everything the app holds about you, as a document you can read, print and keep. And remove your own account, with everything that is yours, by typing its email address.',
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
        target: 'page-title',
        title: 'Can you serve?',
        body: 'The first of three pages for your Sunday; Team Rota and Checklists follow, each in the menu under its own name. One tap per service, for each team you are on. Answers close ahead of the service — the night before, or a number of hours before it begins, whichever your church has set; each service says when — and your head builds the rota from them.',
      },
      {
        path: '/rota',
        target: 'page-title',
        title: 'Team Rota',
        body: 'Who is doing what, and when each team is due in. Your own call time is on your Dashboard too, until the time you are due, and comes to your phone on Saturday evening and again whenever it changes. If a role is yours permanently, you are on the rota for it without being asked, unless you say you cannot serve.',
      },
      {
        path: '/',
        target: 'clock-in',
        title: 'Clock in when you arrive',
        body: 'On a service day, press Clock in on the dashboard when you get to church. Your phone is read once, there and then, and you are marked Present on your teams. If it will not let you, ask to be clocked in, with the time you arrived. Running late? Under it, On my way tells your team roughly when you will be there, and shows you who is in and who is still to come. Only the time is sent, never where you are.',
      },
      {
        path: '/checklists',
        target: 'page-title',
        title: 'Checklists',
        body: 'Your role’s list for the day, grouped by team. It opens at your call time, and a packing-up list opens near the end of the service. Done is yours to tick; your Head or Team Coordinator checks it, and Service Flow signs it off.',
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
        body: 'The songs for each service, in order, with their keys. Songs, the tab beside it, is everything the church sings.',
      },
      {
        path: '/songs',
        target: 'page-title',
        title: 'Songs',
        body: 'A tab beside Set Lists. Every song the church sings, with its key, a link and the words. Start typing a song on a set list and it is found here.',
      },
      {
        path: '/countdown',
        target: 'page-title',
        title: 'Countdown',
        body: 'The service’s clock, large: how long the session has left, green, then amber, then red as the end comes, and past zero how far over it is running. It follows the Service Planner as the running order changes, and sessions one after another that the same person takes are counted as one. Under it is the service itself: how long until it starts, and once it has, until the next one does.',
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
        body: 'In the menu as After the Service, with Issues on the tab beside it. In the hours after a service, say how it went for your team. Your head reads it, and it is gone in a fortnight.',
      },
      {
        path: '/issues',
        target: 'page-title',
        title: 'Issues',
        body: 'The tab beside Debriefs. Something a team has to put right: a cable, a light, a slide. Raise it and that team hears about it.',
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
        body: 'In the menu as Chat, with your own team’s room on the tab beside it. Everybody on a team reads this. @ somebody to mention them, and they are told.',
      },
      {
        path: '/team-chat',
        target: 'page-title',
        title: 'Team Chat',
        body: 'The tab beside the board. Just your team. Each team has its own.',
      },
    ],
  },
  {
    // Cut by a right, not a standing (see the top of the file): every step
    // is on a page or in a room that opens only to whoever the grid names.
    key: 'events',
    standing: 'church',
    title: 'Events, families and DBS',
    steps: [
      {
        path: '/registrations',
        target: 'page-title',
        title: 'Registrations',
        body: 'Events anybody can sign up for from a link, no account needed: tickets, promo codes and invite links, a map, an agenda of the day, who has paid and who was checked in on each day — with a table of the tickets by how each is paid for, and two dropdowns over the list: Status (not paid yet, a receipt to check, paid, free, and what wants doing) and Payment method (bank transfer, the online link, at reception). The list shows as cards or as a table whose headings put it in order. A code can be put on a registration after it is made, a message to the organisers lands on the event’s page, and anything pressed by accident has Undo for ten minutes. Open somebody’s ticket, or the event’s own link, and a bar only the team sees, Back to registrations, brings you back to the event. A finished event counts down to the night the names and contact details come off its registrations; the event itself stays until somebody deletes it.',
      },
      {
        path: '/door',
        target: 'page-title',
        title: 'Reception',
        body: 'A tab beside Registrations for whoever runs them, and a page of its own for whoever only works the door. The door on the day. Scan a ticket’s QR code or find the name, check people in, take a payment, register a walk-in. Somebody who has not paid yet brings their QR code up with “At the event? Show my code” on their registration page. Green buttons let somebody in; the blue one, Mark as paid, records their money without checking them in. Find lists whoever is still to check in; people already in, and cancelled registrations, are under their own headings below it, and a search looks through all of them. Whatever you press says so with Undo, and the row keeps the offer for ten minutes. The ⋯ on a registration has the rest, for whoever may sort out problems: correct an email address, add a note, apply a promo code, waive a payment or put it back to not paid, cancel a registration or put one back, and open their ticket. You are shown the buttons that are yours to press.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/reception',
        title: 'Who works the door',
        body: 'Who works the door, and what each of them may press: check people in, take payments, register walk-ins, sort out problems — or look only. Somebody new starts with all four ticked, for every event; “Chosen events” keeps a person or a team to the events ticked for them. A door right is given once and holds every day, so whoever runs registrations can lock Reception between events: while it is locked the door’s rights give nothing, and nobody’s rights are changed.',
      },
      {
        path: '/families',
        target: 'page-title',
        title: 'Families',
        body: 'With Volunteers and DBS Checks under People in the menu, a tab each for whoever may open them. Every family the church has linked, and everybody who is not in one yet. Search for anybody, open their family and it is drawn out: everybody a circle, and a line between two people with what they are to each other written on it. The box under it links another account as their husband, wife, son, daughter, father, mother, brother or sister, or writes in somebody who is not on the app. Where the account being linked is still on the guest list, the same step can mark them a member there. “View all” draws the whole church on one page. Pinch the picture to make it bigger or smaller, or hold Ctrl and turn the wheel; with a mouse, anybody in it can be dragged to another place. The Owner’s and a Pastor’s, and whoever else the Owner gives “Link families”.',
      },
      {
        path: '/dbs',
        target: 'page-title',
        title: 'DBS Checks',
        body: 'A tab under People. Everybody’s DBS on one page: who is still to check, who has not given their certificate’s details, and who is verified. Filter by where they stand or search a name, and open one to see what a check needs and mark it verified. The Owner’s and a Pastor’s, and whoever else the Owner gives “Safeguarding details”.',
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
        body: 'The tracker shows who has not answered yet. Everybody who has not is reminded for you before answers close, and when they close you are told how your team answered and who did not. Remind somebody yourself with one tap, and approve a change somebody asks for after answers close.',
      },
      {
        path: '/checklists',
        target: 'ready-light',
        title: 'Ready for service',
        body: 'Mark your team ready on the morning, and remind whoever has not finished their list.',
      },
      {
        path: '/rota',
        target: 'page-title',
        title: 'Call times',
        body: 'Set when your team is due in. Everybody on it gets a push when it changes, and you can remind them all with one tap. Whoever may set every team’s can set them all to one time at once.',
      },
      {
        path: '/clock-in',
        target: 'page-title',
        title: 'Who has arrived',
        body: 'Each team’s card shows who is in, and who is still to come. Anybody late for their call time is in red and first, and Arrivals, person by person, keeps each person’s last four weeks. Requests to be clocked in come to whoever answers them.',
      },
      {
        path: '/on-my-way',
        target: 'page-title',
        title: 'On my way',
        body: 'Every team today, name by name: who is here, who is on the way and roughly when, who can’t make it, and who has said nothing. Only the times people gave, never where they are. Who may open it is set in Access & Privileges.',
      },
      {
        path: '/departments',
        target: 'page-title',
        title: 'Your team’s page',
        body: 'Join requests land here for you to answer. Set the team’s roles and each role’s checklist, upload the handbook, and invite somebody straight onto the team. Under a role, make somebody permanent and they are on the rota for it by default. Anybody under 18 has “Under 18” beside their name.',
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
        body: 'The church’s set-up lives here, room by room, in six groups. You see the rooms that are yours to enter.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/access',
        title: 'Access & Privileges',
        body: 'Who can open each page, and who can do what: by role, by team, or one person at a time, down to keeping one person from one thing. Giving or blocking by name opens a list of every right under the area it belongs to, to search and tick as many as are wanted. Every row is the church’s to change, and the database enforces what is chosen. Two of them are a Pastor’s private comments on a session of the running order: who may write one, and who reads them — the Admins and the Owner out of the box, never the team.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/general',
        title: 'General',
        body: 'The church’s time zone, and the bell: the settings that belong to no one page. And what the church says about itself on the page that tells people what is kept about them: who to ask, where to write, and anything in its own words.',
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
        body: 'One table of who has set up what: their details, this tour, location, the app installed, notifications. Ask whoever has something left to finish it, and send this tour to anybody, everyone at once or a few. It opens for them the next time they open the app.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/clock-in',
        title: 'Clock in',
        body: 'Where the church is, how close counts, how long after a call time is late, when the reminder goes, and who answers requests to be clocked in. Fix or add anybody’s time on the Clock In page.',
      },
      {
        path: '/volunteers',
        target: 'people-invite',
        title: 'Volunteers',
        body: 'Everybody with an account. The box at the top finds somebody by name, by team, or by what they are (Admin, Pastor, on no team). Invite people, make somebody a Head or an Admin, and export everything that is known about everybody to a spreadsheet. Block stops an account without removing it, and Unblock puts everything back. Each card says how old the person is, and “Under 18” beside the name where they are. Family on a person’s card links them to their husband or wife, children or parents on the app, with nobody having to confirm, and writes in the ones who are not on the app yet. When a guest joins the app, “Now a member” on the guest list links their account, and where they were also written into a family it offers to link them there in the same step.',
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
        title: 'Preview as',
        body: 'From your account menu, press “Preview as” to see the app as somebody else would: a Church Member; a Team Member, Team Coordinator, Assisting Head or Head of a team you pick; Overwatch; a Pastor. The pages, the menu and the buttons are theirs. The data is still read as you, and anything you save is saved for real.',
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
        body: 'Only you see email addresses, phone numbers and households, on the page and in the export; visa and DBS details are yours and a Pastor’s. The DBS button on each card says where that person stands, opens what a check needs, and is where you mark it verified once you have seen the certificate. You can mark your own, too.',
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
        path: '/',
        target: 'account',
        title: 'Preview as an Admin',
        body: '“Preview as” has one more for you: an Admin, without the Owner’s keys.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/notices',
        title: 'App Notices',
        body: 'Put a line at the top of every page for everybody: information, a warning, or maintenance. A maintenance notice can close the app for a time; out of the box, Admins keep working while it is closed.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/health',
        title: 'App Health',
        body: 'What has gone wrong, so you hear it from the app and not from somebody on Sunday: errors on people’s devices, timed jobs and notifications that failed.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/logo',
        title: 'The app’s mark',
        body: 'The logo at the top of every page, and the icon of the app installed on people’s phones.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/video',
        title: 'Video tutorial',
        body: 'Put a link to a video walkthrough here, and everybody gets Video tutorial in their account menu. Without one, the menu does not show it.',
      },
      {
        path: '/checklists',
        target: 'page-title',
        title: 'Check all',
        body: 'Each open half of a role’s checklist has Check all, which ticks every item up to Sign-off at once. It is yours alone until you give it to others in Access & Privileges.',
      },
      {
        path: '/settings',
        target: 'settings:/settings/data',
        title: 'Erase Data',
        body: 'The one that empties the diary. It asks twice, and it is yours alone until you give it to somebody in Access & Privileges.',
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
/** Where a step is shown to this person: inside the page it is reached from, when that is open to them. */
export function placeOf(step: TourStep, ctx: Pick<TourContext, 'canOpen'>): string {
  return step.at && ctx.canOpen(step.at.split('?')[0]) ? step.at : step.path
}

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

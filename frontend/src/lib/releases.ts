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
  /**
   * Only for people who hold one of these rights (as well as opening
   * `page`, if it names one): for something on a page everybody opens that
   * only a few may do — a Pastor's comments on a session are on the
   * Service Planner, and the whole church has no use for the news.
   *
   * Plain strings, not `CapabilityKey`: this file is also read by the
   * build (build/releasesFile.ts), which imports nothing of the app.
   * `releases.test.ts` checks each is a right there is.
   */
  holds?: string[]
}

/** Whether this release is this person's to be told about. */
function isFor(r: Release, canOpen: (page: string) => boolean, can: (cap: string) => boolean): boolean {
  if (r.page && !canOpen(r.page)) return false
  return !r.holds || r.holds.some(can)
}

export const RELEASES: Release[] = [
  {
    key: 'your-call-time-on-the-dashboard',
    date: '2026-11-20',
    title: 'Your call time, on the Dashboard',
    lead: 'The Dashboard now says when you are due in, and stops saying it once that time has come.',
    points: [
      'A card near the top gives one call time: today’s if there is a service today, otherwise the next service day’s, with a countdown. Later services are not listed.',
      'If your teams are called at different times, each time has a line; teams called together share one.',
      'It goes when the time is reached. The Clock in button takes over from there.',
      'Every team’s call time is still on the Team Rota.',
      'An Admin can change how far ahead it appears, how long it stays after the call time, whether it is for the whole team or only whoever is on the rota that day, and switch it or its countdown off: Settings › Page by Page › Dashboard.',
    ],
    link: { to: '/', label: 'Open the Dashboard' },
    page: '/availability',
  },
  {
    key: 'serving-is-three-pages',
    date: '2026-11-20',
    title: 'Availability, Team Rota and Checklists are pages of their own',
    lead: 'Serving is gone from the menu. The three pages it held as tabs are each in the menu under their own name, where Serving was.',
    points: [
      'Availability, Team Rota and Checklists each open in one tap, and the strip of three tabs across the top of them is gone.',
      'Nothing about the pages themselves has changed, nor who may open each one.',
      'A link or shortcut you kept to Serving still works: it opens the first of the three that is yours.',
      'An Admin can move or rename each of them in Settings › Menu, like any other page.',
    ],
    link: { to: '/rota', label: 'Open Team Rota' },
    page: '/rota',
  },
  {
    key: 'a-calmer-look',
    date: '2026-11-20',
    title: 'A calmer look',
    lead: 'Nothing works differently. Labels are in ordinary case instead of capitals, and each page opens with its title.',
    points: [
      'Labels and status tags read as words: “Paid”, “Starts in”, “Value in service”, not PAID, STARTS IN, VALUE IN SERVICE.',
      'The small line of capitals above each page’s title is gone. Where it said something useful — the date on the Dashboard, “The next 7 days” on Checklists — that now sits under the title.',
      'The bar at the bottom slides to the page you choose without bouncing, and no longer glows.',
      'The search box says Search.',
    ],
  },
  {
    key: 'reception-sorts-out-problems',
    date: '2026-11-20',
    title: 'Reception can sort out its own problems',
    lead: 'Each registration at Reception has a ⋯ menu for whatever is not a check-in, a payment or a walk-in — so the person at the door can deal with it there.',
    points: [
      'From the menu: correct an email address or send the ticket again, add a note, apply a promo code they were meant to use, waive a payment or put it back to not paid, cancel a registration or put one back, and open their ticket.',
      'It is a new tick, “Sort out problems”, in Settings › Reception. Everybody who works the door today has been given it; take it off anybody who should not have it.',
      'Somebody newly added to Reception now starts with everything ticked — check in, payments, walk-ins and sorting out problems — instead of check-in alone.',
      'Every press says so with Undo for ten minutes, like the rest of Reception.',
      'Still the office’s, from the event’s page: verifying a payment against the bank, “not received, ask again”, refunds, taking a promo code off, and anything about the event itself.',
      'An Admin now has every registrations and Reception right out of the box. Each is still a cell in Access & Privileges.',
    ],
    link: { to: '/door', label: 'Open Reception' },
    page: '/door',
  },
  {
    key: 'ticket-way-back',
    date: '2026-11-20',
    title: 'A way back from somebody’s ticket',
    lead: 'Open an attendee’s ticket, or an event’s registration link, and there is now a button at the top that brings you back to that event’s registrations.',
    points: [
      'Back to registrations sits above the ticket and goes straight to the event the ticket is for — no more closing the app and finding the event again.',
      'Only people who can open Registrations see it. The attendee, and anybody else with the link, sees the ticket as before.',
      'If you can also open Reception there is a button for that beside it; somebody who only works the door gets Back to Reception.',
      'The event’s own registration link has the same bar, for whoever runs registrations.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'availability-reminders-follow-the-deadline',
    date: '2026-11-20',
    title: 'Reminders that follow the deadline',
    lead: 'Availability reminders now go before answers close for every service, whatever day it is on, and heads are told when answers close.',
    points: [
      'Whoever has not answered is reminded 24 hours before answers close, and the reminder says when that is. It used to go only on Friday and Saturday evenings, so a midweek or Friday service was never reminded.',
      'When answers close, each team’s Head and Assisting Heads get one message: how many said yes, maybe and no, and who did not answer.',
      'Nobody is woken: both keep to 08:00–21:00.',
      'Settings › Page by Page › Availability sets how long before, or Never, and turns the heads’ message off.',
      'One service can have a deadline of its own: on its page in the Service Planner, under the title, Change.',
      'Answers can now close when the service begins: 0 hours before.',
    ],
    link: { to: '/availability', label: 'Open Availability' },
    page: '/availability',
    holds: ['settings.pages', 'svc.manage'],
  },
  {
    key: 'availability-closes-hours-before',
    date: '2026-11-20',
    title: 'Close availability hours before the service',
    lead: 'The deadline for availability answers can now be a number of hours before each service begins, instead of a time the night before.',
    points: [
      'Settings › Page by Page › Availability › Answers close: choose “The night before” (as it has been) or “Hours before the service”.',
      'Hours are counted back from the start of the service’s first session, from 1 hour to 7 days. An evening service closes later than a morning one.',
      'A service with no running order yet closes the night before until it has one.',
      'Nothing changes until you choose it: the deadline is still the night before, at the time you had set.',
    ],
    link: { to: '/availability', label: 'Open Availability' },
    page: '/availability',
    // News for whoever can change it; everybody else just sees each service's deadline, as before.
    holds: ['settings.pages'],
  },
  {
    key: 'paid-and-check-in-buttons',
    date: '2026-11-20',
    title: 'Clearer buttons for paid and check in',
    lead: 'On Registrations and at Reception, taking somebody’s money and letting them in are two buttons, in two colours.',
    points: [
      'Mark as paid (blue) records the money. Check in (green) lets them in. Each registration shows the one it is waiting for, without opening its menu.',
      'At Reception a registration that still owes has both: Paid & check in, and Mark as paid alone for somebody who is not at the door yet.',
      'A registration of several tickets is checked in whole, and its button says so: Check in all 3.',
      'One set of words everywhere: Not paid yet, Receipt to check, Paid, Waived, Free. “Mark as received” is now “Mark as paid”.',
      'A payment already verified in the account is no longer called “still to pay” at the door: it only wants marking as paid.',
      'A scanned ticket that owes says Payment needed, not Valid. A ticket checked in by its scan has Undo check-in on the same card.',
    ],
    link: { to: '/door', label: 'Open Reception' },
    page: '/door',
  },
  {
    key: 'session-comments',
    date: '2026-11-20',
    title: 'Private comments on a session',
    lead: 'A Pastor can now comment on any session of a service’s running order, and only the Admins and the Owner read it.',
    points: [
      'On the Service Planner, a Pastor opens a session’s menu and chooses Add a comment.',
      'The comment shows on that session for the Admins and the Owner, with who said it and when. The team does not see it, and it is on neither the Preview nor the exported sheet.',
      'Whoever wrote a comment sees their own and can delete it. A comment cannot be edited.',
      'Who may comment, and who may read the comments, are two rows in Access & Privileges under Services: “Comment on a session” and “Read the comments on sessions”. Each role is a choice, and a team or one person can be given either by name.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
    holds: ['svc.comment', 'svc.comment_read'],
  },
  {
    key: 'registrations-table',
    date: '2026-11-19',
    title: 'Registrations as a table',
    lead: 'An event’s registrations can be shown as cards or as a table, one line each.',
    points: [
      'Show as: Cards or Table, beside the filters. A wide screen starts on the table, a phone on cards, and your choice is remembered on that device.',
      'Press a heading to put the table in order — name, tickets, amount, status, payment method, when they registered. Press it again to turn it round.',
      'The search and the two filters work on the table as they do on the cards.',
      'Each row has its next step as a button and the rest in its menu; Details opens the whole registration under the row.',
      'The link to share sits in a box of its own, with Copy link, Download QR code and Open Reception as buttons.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'registration-filters',
    date: '2026-11-19',
    title: 'Simpler filters on registrations',
    lead: 'Two dropdowns over the list of who has registered, and each registration says how it is paid.',
    points: [
      'Status: not paid yet, receipt to check, paid, free — and what wants doing: a payment to verify, an email not delivered, the same email twice.',
      'Payment method: bank transfer, your online link by its own name, at reception, or not chosen yet.',
      'Use both to narrow: Paid with At reception is who paid at the door.',
      'Each choice says how many it would show; one that would show nobody is greyed out.',
      'A dropdown turns blue while it is filtering, with Clear beside it to see everybody again.',
      'On each registration: a tag for how it is paid, and its ticket as a button of its own.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'tickets-by-payment',
    date: '2026-11-19',
    title: 'Tickets by how they are paid for',
    lead: 'An event’s page now splits its tickets by scenario, not only into received and still to come.',
    points: [
      'Under the ticket types: How the tickets are paid for.',
      'Free with each promo code or invite link, then each way of paying: bank transfer, the online link, at reception, and not chosen yet.',
      'For each: what is paid and verified, paid and not verified, has a receipt to check, or is not paid yet — with orders, tickets and the money.',
      'Every live registration is counted once, so it adds up to the numbers at the top.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'names-written-as-names',
    date: '2026-11-18',
    title: 'Names are written like names',
    lead: 'However a name is typed, it is saved with its capitals: “john SMITH” is John Smith.',
    points: [
      'Everybody’s name has been put right once — on the rota, the teams and the guest roll. Only capitals and spaces moved.',
      'From now on it happens as you type: leave the box and the name is shown as it will be kept.',
      'Anne-Marie, O’Brien and McDonald keep their capitals. A capital you type inside your own name, as in MacDonald, is kept.',
      'Initials stay capitals: KB, or a last name of YL.',
      'A name is letters only. Numbers and symbols are refused, with what to take out said by the box.',
      'Registrations and Reception are as they were: a visitor’s name is kept as they typed it.',
      'If yours has come out wrong, change it in Settings › Profile.',
    ],
  },
  {
    key: 'event-agenda',
    date: '2026-11-18',
    title: 'An event can have an agenda',
    lead: 'The running order of the day, on the event’s own page — like the Service Planner has for a service.',
    points: [
      'In an event’s editor: Agenda. It is optional — an event with none shows nothing.',
      'Only a title is needed. Start and end times and a line of detail are there when you know them.',
      'For an event over several days: one agenda for the whole event, or one for each day. A day can be left with nothing.',
      'People see it on the event’s page, under About, before they register — and on their ticket, for the day they booked.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'promo-later',
    date: '2026-11-17',
    title: 'A promo code can be added after registering',
    lead: 'Somebody who registered without their code no longer has to register again.',
    points: [
      'On a registration awaiting payment: ⋯ › Apply a promo code. The price comes down, or it becomes their ticket.',
      'They can do it themselves too: an unpaid ticket page now asks “Have a promo code?”.',
      'A code on the wrong registration comes off again: ⋯ › Remove promo code. The price goes back and the code has its use back.',
      'Registrations under the same email are tagged, with a filter, so a double registration is easy to find and cancel.',
      'Waived payments are shown apart from money received, on the page and in the export.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'promo-tickets-covered',
    date: '2026-11-17',
    title: 'A promo code can cover just one ticket',
    lead: 'A code used to take its discount off every ticket in an order. Now you can say how many.',
    points: [
      'In an event’s promo codes: Tickets covered. Put 1 and a free code gives one free ticket an order, not ten.',
      'Left blank, a code covers every ticket, as before. Codes you already have are unchanged.',
      'A ticket no longer prints the code that was used, so a forwarded ticket does not hand it on.',
      'A personal invite link’s ticket now goes to that person’s email only, not onto the screen.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'invite-links',
    date: '2026-11-16',
    title: 'Invite links for registrations',
    lead: 'A link that takes its discount off by itself. Nobody is told a code, so there is none to pass on.',
    points: [
      'On an event’s page: New invite link. Send it; whoever opens it sees the discount already taken off.',
      'One person: kept to their email address, and it works once. A group: a set number of uses.',
      'Each link covers a number of tickets, can end on a date, and can be turned off on its own.',
      'The page says who registered through each link. Promo codes work as before.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'calendar-add',
    date: '2026-11-15',
    title: 'Adding to the Calendar is simpler',
    lead: 'The page is called Calendar now, and adding to it starts with one question.',
    points: [
      'Event: a one-off, on a date or over a few days — a conference, a workday, a leaders’ meeting.',
      'Regular meeting: what happens every week or month — Bible study, choir practice. It goes on until you stop it.',
      'Each has its own short form. What was filed as a Meeting is now under Regular meetings.',
    ],
    link: { to: '/events', label: 'Open the Calendar' },
    page: '/events',
  },
  {
    key: 'quiet-updates',
    date: '2026-11-15',
    title: 'Updates no longer interrupt you',
    lead: 'A new version, and what is in it, are a small line at the top of the screen now — never a box in the way.',
    points: [
      'When a new version is ready: Reload when it suits you, or Later. Nothing is held up.',
      'Show details says what the update brings, before you reload — only if you want to know.',
      'On Countdown, a clock that has run over now blinks, so it is seen from the stage.',
    ],
  },
  {
    key: 'dashboard-glimpse',
    date: '2026-11-15',
    title: 'What is on, at a glance',
    lead: 'A running service’s card on the Dashboard now says what is happening this minute.',
    points: [
      'The session that is on, who is taking it, and its time left — or how far over it is.',
      '“Ready for service?” is inside the card too, with the switch for whoever may turn a team’s light.',
      'Each team has a bar and a percentage: how far it is through its checklist.',
    ],
    link: { to: '/', label: 'Open the Dashboard' },
    page: '/',
  },
  {
    key: 'not-ended',
    date: '2026-11-15',
    title: 'Not ended',
    lead: 'When the last session runs over, say so, and the clock counts how far.',
    points: [
      '“Not ended” sits beside End service at the foot of the running order, and in the last session’s menu.',
      'With it on, the last session stays on past its time and its overrun counts, on the planner and on Countdown.',
      'End service then says how far over the last session ran.',
      'Countdown’s clock is green with plenty of time, amber as the end comes close, and red for the last of it.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
  {
    key: 'countdown',
    date: '2026-11-08',
    title: 'Countdown',
    lead: 'The service’s clock, large enough to read from the side of the stage.',
    points: [
      'How long until the next session, or until the end of the service.',
      'Past zero it keeps counting, with a plus, so you can see how far over it is running.',
      'It is the Service Planner’s clock: time added, a session not started yet, one dropped — it follows at once.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
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
    lead: 'On a day you serve, a Clock in button appears on your Dashboard a few minutes before your call time.',
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
  can: (cap: string) => boolean = () => false,
): Release | null {
  return releases.find((r) => !(r.key in seen) && isFor(r, canOpen, can)) ?? null
}

/** Every release this person has not been told about and may open, newest first. */
export function unseenReleases(
  seen: Record<string, string>,
  canOpen: (page: string) => boolean,
  releases: Release[] = RELEASES,
  /** Asked only about a release that names rights. Left out, nobody holds any: such a release is told to nobody rather than to everybody. */
  can: (cap: string) => boolean = () => false,
): Release[] {
  return releases.filter((r) => !(r.key in seen) && isFor(r, canOpen, can))
}

/** How many releases the details list names; anything older is counted, not listed. */
export const DETAILS_SHOWN = 5


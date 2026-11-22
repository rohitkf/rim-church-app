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
    key: 'finished-events-count-down',
    date: '2026-11-22',
    title: 'A finished event counts down to its clear-up',
    lead: 'Some time after an event’s last date, the names, emails and phone numbers on its registrations are removed overnight. A finished event now says how long is left.',
    points: [
      'On Registrations, each finished event has a line: “Names and contact details removed in 89 days 14 hrs”.',
      'The event’s own page has the full countdown, the date, and a reminder to export to Excel first if the names are needed.',
      'Nothing deletes the event itself: the orders, ticket codes and sums stay until somebody deletes it.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'dbs-details-and-verified',
    date: '2026-11-22',
    title: 'A DBS check now has its details, and gets verified',
    lead: 'Saying you have a DBS check was a yes or a no. A yes now comes with the certificate’s details and your permission to check it, and somebody at church marks it verified.',
    points: [
      'If you said yes, the app asks for the details the next time you open it: which check it is, the certificate number, the surname on it and the date it was issued. Have the certificate to hand.',
      'You tick a box to give permission for the check. When you did is kept.',
      'Your profile shows how old the certificate is and whether it has been verified. Whoever checks it will ask to see the original and photo ID.',
      'If you do not have one, answer no and nothing more is asked.',
    ],
  },
  {
    key: 'one-name-only',
    date: '2026-11-22',
    title: 'Somebody with one name can say so',
    lead: 'A last name used to be compulsory, so somebody with a single name had to make one up. There is now a box to tick: “I only have one name”.',
    points: [
      'It is under the names when signing up, on the details form and on your profile (Settings › Profile). Ticked, the last name is left empty and is not asked for again.',
      'Left unticked, a blank last name is still asked for, so one that was simply forgotten is still caught.',
      'Lists and exports show the one name, filed under it.',
    ],
  },
  {
    key: 'an-events-money-for-the-books',
    date: '2026-11-22',
    title: 'An event’s export, ready for the accounts',
    lead: 'Each event’s export now works the money out, on sheets of its own, for whoever keeps the church’s books.',
    points: [
      'Money: what was charged, received, still to come and waived; what came in on registrations since cancelled; refunds; what should be in the bank and the cash box now; and what stays once refunds are paid.',
      'Accounts: a row for every registration with its money as numbers, the day it was paid, who took it, the reference, and whether it was checked against the bank.',
      'Money by day and by way of paying, to lay beside a bank statement; who took the money; income by ticket type after discounts; who still owes; and the refunds.',
      'Every sheet adds up to the same totals. The sheets that were there before are unchanged.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'exports-with-everything',
    date: '2026-11-22',
    title: 'Exports with everything in them',
    lead: 'The Volunteers export and each event’s export now carry every detail there is, not a summary.',
    points: [
      'Volunteers: age and whether under 18, marital status, the address, when they joined and last signed in, whether their details are finished and what is missing, whether they are blocked, and how often they have served. New sheets list every time on the rota, and the guests.',
      'An event: what each order bought and who is coming, what is still owed, everything that happened to its email, and who checked it in. New sheets hold the event’s own details, its dates, ticket types, every check-in, promo codes, invitation links, the agenda and the messages sent to the organisers.',
      'Each part is in the file only for somebody who may see it. If a part cannot be read, the export says which.',
    ],
    link: { to: '/volunteers', label: 'Open Volunteers' },
    page: '/volunteers',
    holds: ['people.contacts'],
  },
  {
    key: 'a-real-date-of-birth',
    date: '2026-11-22',
    title: 'A date of birth has to be a real one',
    lead: 'A date of birth left on today’s date, or on this year, is no longer accepted. Anybody who has one is asked for their own before the app opens.',
    points: [
      'Somebody with an account is between 5 and 110 years old; anything else is refused, with the reason, on the joining form and on the profile.',
      'Volunteers shows each person’s age, and “Date of birth to correct” where the date cannot be right.',
      '“Under 18” is marked beside the name on a team’s page and on Volunteers, for Admins and the people who lead a team. Settings › Permissions has it as “See under 18s”.',
    ],
    link: { to: '/volunteers', label: 'Open Volunteers' },
    page: '/volunteers',
    holds: ['people.minors'],
  },
  {
    key: 'write-a-family-member-in',
    date: '2026-11-22',
    title: 'Add family who are not on the app',
    lead: 'The Family button on Volunteers now takes people who have no account: type their name and choose “Not on the app? Add by hand”.',
    points: [
      'A husband or wife, a child or a parent: their name and date of birth, and for a child whether a boy or a girl, the school and the year.',
      'They are listed with “No account”, and can be changed or removed from the same place. The family sees them on their own profile and is told.',
      'When they join the app, link their account from Family and it takes the written entry’s place.',
    ],
    link: { to: '/volunteers', label: 'Open Volunteers' },
    page: '/volunteers',
    holds: ['people.family'],
  },
  {
    key: 'link-a-family-for-them',
    date: '2026-11-22',
    title: 'Link families yourself',
    lead: 'On Volunteers, every person’s card now has a Family button. It links two people on the app as husband and wife, or a child to their parents, straight away.',
    points: [
      'Nobody has to confirm. Each person whose family changes gets a notification, and sees who on their own profile.',
      'A child linked to one of a couple is the child of both. Unlink is in the same place.',
      'It refuses what cannot be right, and says why: a second husband or wife, or a child who is already linked to another parent.',
      'Families can still link themselves from their profiles, as before. Admins have this out of the box; Settings › Permissions has it as “Link families”.',
    ],
    link: { to: '/volunteers', label: 'Open Volunteers' },
    page: '/volunteers',
    holds: ['people.family'],
  },
  {
    key: 'countdown-joins-the-same-persons-sessions',
    date: '2026-11-22',
    title: 'Countdown counts one person’s sessions together',
    lead: 'When the same person takes two or more sessions one after another, the Countdown page now shows the time for all of them as one clock.',
    points: [
      'A speaker with “Message” and then “Message 1” sees the time left for both, and the number no longer turns red when only the first one’s time is up.',
      'It counts to whatever comes after: the next session somebody else takes, or the end of the service. A line under the number says which sessions are being counted together.',
      'It goes by who is taking the session, not who stands in or translates. The Service Planner and the Dashboard still show each session’s own time.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
  {
    key: 'countdown-to-the-service',
    date: '2026-11-22',
    title: 'Countdown also counts to the service',
    lead: 'The Countdown page now has a second section under the sessions: how long until the service starts.',
    points: [
      'Before a service begins, it counts down to that service’s start, so the page is no longer blank beforehand.',
      'Once a service is running, it counts down to the next one, whether that is later the same day or next week.',
      'The sessions’ clock above it is unchanged.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
  {
    key: 'a-confirmation-link-lands-on-sign-in',
    date: '2026-11-21',
    title: 'The link in a confirmation email opens the app',
    lead: 'Pressing the link in a sign-up email confirmed the account and then opened “Page not found”. It now opens the app, signed in.',
    points: [
      'The cause was a setting saved with a stray pattern on the end; it has been put right, and the app now names the page itself so no setting decides it.',
      'A link pressed after it has expired opens the sign-in page, which says so and says what to do.',
    ],
    holds: ['app.permissions'],
  },
  {
    key: 'every-teams-call-time-at-once',
    date: '2026-11-21',
    title: 'Set every team’s call time at once',
    lead: 'When every team is due at the same time, it can now be set once for all of them instead of team by team.',
    points: [
      'On Team Rota, in Call times, pick the day, then a time under “Every team at once”, and press Set for every team.',
      'It says how many teams would change before you press, and asks before it writes.',
      'Only teams whose time changes are written, so nobody is told of a change that is not one. Each team that changes is told, as when it is set on its own.',
      'Each team’s own box is still there for the one that differs.',
    ],
    link: { to: '/rota', label: 'Open Team Rota' },
    page: '/rota',
    holds: ['svc.call_times'],
  },
  {
    key: 'assign-translator-can-be-given',
    date: '2026-11-21',
    title: 'Assign translator can be given to a team or a person',
    lead: 'Naming a session’s translator is now one of the Service Planner’s buttons that can be given on its own, as Assign substitute is.',
    points: [
      'Give it in Settings › Page by Page › Service Planner, to a team or to named people, or by role under Access and privileges.',
      'Whoever holds it names, orders and removes translators, and nothing else: not who takes the session, not its substitute, not its name or time.',
      'The “Sub” mark has gone from a substitute’s name, as “Trans” did: the row already says Substitute.',
      'A guest’s note is now on the exported sheet too, under their name.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
    holds: ['svc.sessions'],
  },
  {
    key: 'countdown-goes-below-zero',
    date: '2026-11-21',
    title: 'Countdown shows an overrun with a minus',
    lead: 'When a session runs over its time, the Countdown page now reads −2:17 where it read +2:17.',
    points: [
      'Only the Countdown page changes. The Service Planner and the Dashboard still show an overrun with a plus.',
      'The line under the number still says it in words: “2 minutes over”.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
  {
    key: 'registration-takes-the-address-as-typed',
    date: '2026-11-21',
    title: 'Registration and Reception take an email address as it is typed',
    lead: 'The check that refused an address ending in “.con” has been taken off the registration and Reception forms. It stays on signing up and asking for a reset link.',
    points: [
      'Registering for an event, a walk-in at Reception, an invitation and a correction to a registration’s address no longer refuse an address for its ending.',
      'The register form still asks for the address twice and reads it back before registering, and still asks about a slip such as gmial.com.',
      'An address typed wrong on a registration goes through, its email fails, and it shows on Registrations with a red mark to put right, as it did before.',
    ],
    holds: ['reg.manage'],
  },
  {
    key: 'clear-not-started',
    date: '2026-11-21',
    title: 'Taking back “Not started” is now called what it does',
    lead: 'A session marked Not started by mistake is cleared from its own menu, with a button that now says so: Clear “Not started”.',
    points: [
      'It used to read “Still not started”, which sounded like it kept the hold. Pressing it always took the hold off; only the name was wrong.',
      'Open the menu of each session that shows Holding and press Clear “Not started”. No times move.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
    holds: ['svc.sessions'],
  },
  {
    key: 'an-address-that-goes-nowhere',
    date: '2026-11-21',
    title: 'Signing up checks that the address can receive email',
    lead: 'Before an account is made, the app now asks whether anything can receive email at the address’s domain, and an account that is never confirmed is removed after seven days.',
    points: [
      'An address at a domain that does not exist, or takes no email, is refused under the box with the reason. Only the part after the @ is looked up, by the app’s own server.',
      'When that cannot be found out (no signal, a slow answer) signing up carries on: nobody is turned away on a guess.',
      'An account made by signing up whose link is not pressed within seven days is removed, and the person can sign up again. Sending the link again starts the seven days over.',
      'Nobody you invited is removed, and nobody who has been put on a team, a rota or a session, or linked to a guest.',
    ],
    holds: ['app.permissions'],
  },
  {
    key: 'a-note-on-a-session',
    date: '2026-11-21',
    title: 'A session can carry a note',
    lead: 'What a session’s name, time and people do not say can now be written on it as a note, which everybody who opens the running order reads.',
    points: [
      'On the Service Planner, open a session’s menu and choose Add a note. A Note row opens on the session: type it and move on, and it is saved.',
      'To change it, type over it. To take it off, clear it. Undo puts back what it said.',
      'It is shown under the session to everybody, on the Preview, and on the exported sheet under a NOTE label.',
      'While the session is on, its note is also on the Dashboard’s card for the service.',
      'A note is not a comment: a comment is private, a note is for everyone. Writing one is for whoever plans the running order.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
    holds: ['svc.sessions'],
  },
  {
    key: 'sign-up-confirms-the-address',
    date: '2026-11-21',
    title: 'Signing up confirms the email address, as registering does',
    lead: 'Somebody making an account now types their email address twice and is then shown it on its own and asked whether it is right, before the account is made.',
    points: [
      'The two boxes have to say the same address.',
      '“Is this your email address?” shows it large, and Yes cannot be pressed for five seconds, so it is read.',
      'Nothing is made until Yes: an account made with a slip in its address could never be confirmed.',
    ],
    holds: ['app.permissions'],
  },
  {
    key: 'an-email-address-that-can-be-one',
    date: '2026-11-21',
    title: 'A mistyped email address is caught as it is typed',
    lead: 'An address ending in “.con”, or any other ending that does not exist, is no longer taken: the form says so and offers the address that was meant.',
    points: [
      'Signing up and asking for a reset link check it. (Registration and Reception did too at first; that was taken off the same day.)',
      'It says why (“Email addresses do not end in .con”) and offers the right one, such as name@gmail.com, to take with one press.',
      'A comma typed for the dot, a space, or a full stop left on the end are mended the same way.',
      'An address that could be real but looks like a slip, such as gmial.com, is still only asked about, as before.',
    ],
  },
  {
    key: 'minutes-under-the-clock',
    date: '2026-11-21',
    title: 'The minutes left, under the clock',
    lead: 'The Countdown and the running order now say the time left as one number of minutes, right under the timer.',
    points: [
      'With 1:12:55 on the clock, the line under it reads “73 minutes remaining”: no hour to work out first.',
      'It rounds up while counting down, as a timer does, and says “under a minute” for the last of it.',
      'Past zero it says how many minutes over.',
      'On the Service Planner the same number is under the timer on the rail, as “73 min”.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
  {
    key: 'a-session-can-have-a-translator',
    date: '2026-11-21',
    title: 'A session can have a translator',
    lead: 'Whoever translates a session as it is taken can now be named on it, apart from who takes it and who stands in.',
    points: [
      'On the Service Planner, open a session’s menu and choose Assign translator, under Assign substitute. A Translator row opens on the session: pick one person or several, members or guests.',
      'Translators show in indigo, in their own row labelled Translator, so they are never read as one more person taking the session. Everybody who opens the running order sees them.',
      'The Preview and the exported sheet list them under a TRANSLATOR label.',
      'A person is on a session once: taking it, standing in, or translating. Naming translators is for whoever plans the running order.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
    holds: ['svc.sessions'],
  },
  {
    key: 'countdown-button-on-the-running-order',
    date: '2026-11-21',
    title: 'A button to the Countdown on the running order',
    lead: 'A service’s running order now has a Countdown button, for everybody who may open the Countdown.',
    points: [
      'It is at the top of the running order, beside the number of sessions, and opens the Countdown page.',
      'The Countdown already has “Running order” on each service, so the two pages lead to each other.',
      'Somebody who may not open the Countdown does not see the button.',
    ],
    link: { to: '/countdown', label: 'Open Countdown' },
    page: '/countdown',
  },
  {
    key: 'a-guests-note-under-their-name',
    date: '2026-11-21',
    title: 'A guest’s note shows under their name',
    lead: 'On the Service Planner, what was written about a guest is now said under their name on the session.',
    points: [
      'A guest with a note reads as two lines: their name, then “Note: pastor from Harlow”.',
      'It shows for everybody who opens the running order, and for a guest named as a substitute too.',
      'The note is the one kept on the guest list on Volunteers; a guest with no note looks as before.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
  },
  {
    key: 'type-to-find-in-long-lists',
    date: '2026-11-21',
    title: 'Type to find a person or a right',
    lead: 'In Access & Privileges, the long lists now open with a box to type in, so nobody has to scroll for a name.',
    points: [
      'By person: choosing who, and “Give them one thing more”, each open with a search box. Type any part of a name — “sam” finds every Sam — or of what you want to give, such as “countdown”.',
      'By team: the same for choosing the team and what to give it.',
      'Typing the name of a section, such as “services”, lists everything in it.',
      'The same box is on “Who arrived” when a clock-in is entered by hand.',
    ],
    holds: ['app.permissions'],
  },
  {
    key: 'order-the-people-on-a-session',
    date: '2026-11-21',
    title: 'Put the people on a session in order',
    lead: 'Where a session has more than one person on it, their names can now be dragged into the order you want.',
    points: [
      'On the Service Planner, each name on a session has a grip of dots at its left. Hold the grip and drag the name to its place; the others move out of the way.',
      'With a keyboard, focus the grip and use the arrow keys.',
      'The order is the one everybody sees: the Dashboard, the Countdown, the Preview and the exported sheet list them the same way.',
      'Substitutes are ordered the same way, in their own row. Moving a name notifies nobody.',
    ],
    link: { to: '/service-planner', label: 'Open Service Planner' },
    page: '/service-planner',
    holds: ['svc.sessions'],
  },
  {
    key: 'a-check-in-for-each-day',
    date: '2026-11-21',
    title: 'Who came on which day',
    lead: 'An event of several days now keeps each day’s check-in, instead of only the latest.',
    points: [
      'On an event’s page, “Who has registered” counts each day separately, and each registration shows every day it was checked in on.',
      'The export has a column for each day, and the sums count each day.',
      'Reception is unchanged: somebody checked in on an earlier day is still offered a check-in again today.',
      'Undoing today’s check-in no longer loses an earlier day’s.',
    ],
    link: { to: '/registrations', label: 'Open Registrations' },
    page: '/registrations',
  },
  {
    key: 'payment-reference-not-a-qr-code',
    date: '2026-11-21',
    title: 'An unpaid registration shows a payment reference, not a QR code',
    lead: 'People were registering, seeing a QR code and stopping there. Until it is paid, the page now gives them a payment reference and what to pay.',
    points: [
      'Not paid yet: the code is labelled “Payment reference”, with no QR code in sight, and the page says “places held” rather than “tickets”.',
      'At the door they tap “At the event? Show my code” and the QR code comes up for Reception to scan, as before. That is there whatever way they meant to pay.',
      'A receipt being checked still shows its QR code. A paid ticket is unchanged.',
      'If somebody cannot bring it up, Find still finds them by name, email, phone or the reference.',
    ],
    link: { to: '/door', label: 'Open Reception' },
    page: '/door',
  },
  {
    key: 'reception-for-chosen-events',
    date: '2026-11-20',
    title: 'Reception for chosen events',
    lead: 'Somebody on Reception can be kept to the events you choose for them, instead of every event the church runs.',
    points: [
      'In Settings › Reception each person and team has “Events”: Every event, or Chosen events with a tick for each one.',
      'Kept to chosen events, they see and work only those at Reception: the list, check-in, payments, walk-ins and sorting out problems. The others are not shown to them at all.',
      'Everybody on Reception today still has every event. Nothing changes until you choose.',
      'An event made later is not theirs until it is ticked. The Owner, Admins and whoever runs registrations always have every event.',
    ],
    // For whoever may change the ticks; a Settings room is not a page with an opening rule, so no link.
    holds: ['app.permissions'],
  },
  {
    key: 'reception-list-by-who-is-in',
    date: '2026-11-20',
    title: 'Reception lists who is still to check in',
    lead: 'On Find, people who have checked in today move out of the way, so the list is the people you are still waiting for.',
    points: [
      '“Not checked in yet” is the list, with a count. Checking somebody in takes them off it.',
      '“Checked in” and “Cancelled” are headings underneath, shut, each with a count. Tap one to open it — the latest check-in is first, with its Undo.',
      'Searching looks through everybody at once, whether or not they are in.',
      'Scan and Walk-in are unchanged.',
    ],
    link: { to: '/door', label: 'Open Reception' },
    page: '/door',
  },
  {
    key: 'your-call-time-on-the-dashboard',
    date: '2026-11-20',
    title: 'Your call time, on the Dashboard',
    lead: 'The Dashboard now says when you are due in, and stops saying it once that time has come.',
    points: [
      'A card near the top gives one call time: today’s if there is a service today, otherwise the next service day’s, with a countdown. Later services are not listed.',
      'If your teams are called at different times, each time has a line; teams called together share one.',
      'It goes when the time is reached, and the Clock in button takes over from there. Once the day’s last service has ended, the next service day’s call time appears.',
      'Every team’s call time is still on the Team Rota.',
      'An Admin can change how far ahead it appears, how long it stays after the call time, whether the next one appears after the last service or the next day, whether it is for the whole team or only whoever is on the rota that day, and switch it or its countdown off: Settings › Page by Page › Dashboard.',
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


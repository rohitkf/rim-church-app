import type { DockItem } from '../components/DockNav'
import {
  FamilyTreeIcon,
  ShieldIcon,
  BoxIcon,
  UserCheckIcon,
  FeedbackIcon,
  GiftHeartIcon,
  CalendarIcon,
  ChecklistIcon,
  HandIcon,
  NotebookIcon,
  ClipboardUserIcon,
  MusicIcon,
  ListIcon,
  MapPinIcon,
  PrayIcon,
  GridIcon,
  IdCardIcon,
  ChatTeamIcon,
  MegaphoneIcon,
  PollIcon,
  WarningIcon,
  MessageIcon,
  StageIcon,
  TimerIcon,
  UsersIcon,
} from '../components/icons'

/**
 * A destination. Who it is offered to is lib/pageAccess's (the church's
 * choice); where it sits is lib/navLayout's.
 */
export type NavItem = DockItem & {
  /**
   * The page this one is reached from. The services are planned from the
   * Calendar (November 2026), so the planner is not a second entry in the
   * menu beside it. It stays in this list because it is still a page: it
   * has a rule for who may open it, a room in Settings and a name the
   * church can change. Somebody the Calendar is closed to keeps it in
   * their menu, or they would have no way in.
   */
  within?: string
}

/**
 * What goes in one person's menu: the pages they may open, less any that
 * is reached from inside another page they may also open. That other page
 * is marked as covering it, so the menu still shows where they are.
 */
export function menuItems<T extends NavItem>(items: T[], canOpen: (path: string) => boolean): T[] {
  const folded = items.filter((i) => i.within && canOpen(i.to) && canOpen(i.within))
  return items
    .filter((i) => canOpen(i.to) && !folded.includes(i))
    .map((i) => {
      const covers = folded.filter((f) => f.within === i.to).map((f) => f.to)
      return covers.length > 0 ? { ...i, covers } : i
    })
}

/*
 * The destinations, under six headings that each say one thing.
 *
 * They used to be in the order they were built, which is nobody's order,
 * and then under headings that had grown by accretion: "Sunday" held ten
 * pages, from saying whether you can serve to the stage plan, and a page
 * added later landed wherever its default heading happened to be. The
 * Owner asked for groups with proper names and every page under the one
 * it belongs to (November 2026). So, in order:
 *
 *   Above the headings: the Dashboard, then the Calendar, where the
 *     services are and the running order it is all pointing at.
 *   Serving: your own part, in the order it reaches you. Say whether you
 *     can serve, see who was put on, tick what is yours, and who arrived.
 *   Service Planning: what a service is made of. Its songs, where
 *     everything stands, and its clock.
 *   After the Service: what was said about it and what needs putting right.
 *   Communications: what the church is saying, then the teams, then the
 *     questions put to people, and last what people say about the app.
 *   Church Life: praying, giving, and the events people sign up for.
 *   People & Teams: the teams, the people who fill them, and what they keep.
 *
 * The names are the ones the church's own saved menu uses too, so a page
 * added to the app later lands under the same heading in both
 * (lib/navLayout's applyNavLayout places an unknown page by this name).
 *
 * The dock's phone window slides along this list (lib/dockWindow), so the
 * order is not only a menu but the path along it: from Availability the
 * next step right is the rota built from it, and the one after is the
 * checklist for the morning. Getting it wrong costs a tap every time.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: GridIcon },
  // The services are planned from the Calendar (November 2026), which
  // has taken the planner's place as the second thing in the menu.
  // Called Calendar since November 2026: it holds services, birthdays and
  // anniversaries as well, and "Events" was one of the five things on it.
  { to: '/events', label: 'Calendar', icon: CalendarIcon },

  // Your own part, in the order it happens to you: say whether you can
  // serve, see who was put on, tick off what is yours on the day. Three
  // pages, each in the menu under its own name. For a month they were one
  // "Serving" entry with a tab each; the church asked for them back as
  // pages of their own (November 2026), and lib/navLayout's MOVED puts a
  // menu saved in between right. The heading has the name the entry had.
  { to: '/availability', label: 'Availability', icon: HandIcon, group: 'Serving' },
  { to: '/rota', label: 'Team Rota', icon: ClipboardUserIcon, group: 'Serving' },
  { to: '/checklists', label: 'Checklists', icon: ChecklistIcon, group: 'Serving' },
  // Who has arrived, and when: the watchers' page, not the volunteers'
  // (they clock in from the Dashboard).
  { to: '/clock-in', label: 'Clock In', icon: MapPinIcon, group: 'Serving' },

  // What a service is made of. The planner's own entry is kept for
  // somebody the Calendar is closed to (`within`); everybody else reaches
  // the services from the Calendar.
  { to: '/service-planner', label: 'Service Planner', icon: CalendarIcon, group: 'Service Planning', within: '/events' },
  { to: '/set-lists', label: 'Set Lists', icon: MusicIcon, group: 'Service Planning' },
  // Every song the church sings, kept for good (0241, 0243): where the
  // set list's song box finds them.
  { to: '/songs', label: 'Songs', icon: ListIcon, group: 'Service Planning' },
  // Where everything stands on the morning, drawn once for everybody.
  { to: '/stage', label: 'Stage Layout', icon: StageIcon, group: 'Service Planning' },
  // The running order's clock, large, for whoever keeps the time.
  { to: '/countdown', label: 'Countdown', icon: TimerIcon, group: 'Service Planning' },

  // And what was said about it afterwards, which is the last step of a
  // Sunday rather than a thing looked up.
  { to: '/debriefs', label: 'Debriefs', icon: NotebookIcon, group: 'After the Service' },
  // What somebody noticed that a team has to put right. Teams always see
  // it; everybody does once App settings let everybody raise one.
  { to: '/issues', label: 'Issues', icon: WarningIcon, group: 'After the Service' },

  // For everybody, Church Members included: what the church is saying.
  { to: '/updates', label: 'Church Updates', icon: MegaphoneIcon, group: 'Communications' },
  // The teams talking. Nothing in either belongs to somebody who is not
  // on a team yet, so neither is offered until they are.
  { to: '/messages', label: 'Messages', icon: MessageIcon, group: 'Communications' },
  { to: '/team-chat', label: 'Team Chat', icon: ChatTeamIcon, group: 'Communications' },
  // What the church is asking.
  { to: '/polls', label: 'Polls', icon: PollIcon, group: 'Communications' },
  // Telling the people who run the app what to fix: the last thing here,
  // because it is talk about the app rather than in it.
  { to: '/feedback', label: 'Feedback', icon: FeedbackIcon, group: 'Communications' },

  // Asking for prayer, praying for each other, and what God has done (0197).
  { to: '/prayer', label: 'Prayer Requests', icon: PrayIcon, group: 'Church Life' },
  { to: '/giving', label: 'Giving', icon: GiftHeartIcon, group: 'Church Life' },
  // Events anybody can sign up for from a link (0244): the Owner's, and
  // whoever the grid gives "Run registrations".
  { to: '/registrations', label: 'Registrations', icon: UserCheckIcon, group: 'Church Life' },
  // Reception (0247): the door, for whoever works it.
  { to: '/door', label: 'Reception', icon: IdCardIcon, group: 'Church Life' },

  // Looked up rather than lived in: the teams, the people who fill them,
  // and the cupboard they draw on.
  { to: '/departments', label: 'Teams', icon: UsersIcon, group: 'People & Teams' },
  { to: '/volunteers', label: 'Volunteers', icon: IdCardIcon, group: 'People & Teams' },
  // Who is linked to whom, drawn as a tree, and linking more (0326): whoever may link families.
  { to: '/families', label: 'Families', icon: FamilyTreeIcon, group: 'People & Teams' },
  // Everybody's DBS and marking one verified (0324): the Owner's, and whoever is given it.
  { to: '/dbs', label: 'DBS Checks', icon: ShieldIcon, group: 'People & Teams' },
  { to: '/inventory', label: 'Inventory', icon: BoxIcon, group: 'People & Teams' },
]

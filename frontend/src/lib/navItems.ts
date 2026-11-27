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
  /**
   * Reached from that page as a tab beside it: the two are one entry in
   * the menu and a strip of tabs across the top of each (PageTabs). Issues
   * beside Debriefs, Songs beside Set Lists. Without it, `within` means
   * the host has its own way in (the Calendar's Services chip).
   */
  tab?: true
  /**
   * What the menu calls this page while it holds tabs: "People" for
   * Volunteers with Families and DBS Checks beside it. Left out where the
   * page's own name already covers what is inside (Set Lists, with Songs).
   */
  family?: string
}

/**
 * Where the church's own name for a menu entry that holds tabs is kept:
 * beside its names for pages, in the saved menu's `labels` (lib/navLayout),
 * under a key no address can be. A page's name is what its tab and its
 * heading say; the entry's name is what the menu says for the two or three
 * together, so they are two names and the church can change either.
 */
export const entryNameKey = (host: string) => `family:${host}`

/** A page and the pages reached from inside it, the page itself first, in the app's own order. */
function familyOf<T extends NavItem>(items: readonly T[], host: string): T[] {
  return [...items.filter((i) => i.to === host), ...items.filter((i) => i.within === host)]
}

/**
 * What goes in one person's menu: the pages they may open, with a page
 * and the pages reached from inside it as one entry. The entry is the
 * first of them this person may open, it covers the rest (so the menu
 * still shows where they are), and it takes the entry's name: the
 * church's (`names`, Settings › Menu) where it has given one, otherwise
 * the family's, otherwise the page's own. Somebody who may open only one
 * of them sees that page as itself.
 */
export function menuItems<T extends NavItem>(items: T[], canOpen: (path: string) => boolean, names: Record<string, string> = {}): T[] {
  const hosts = [...new Set(items.flatMap((i) => (i.within ? [i.within] : [])))]
  const dropped = new Set<string>()
  const leads = new Map<string, { covers: string[]; label?: string }>()
  for (const host of hosts) {
    const open = familyOf(items, host).filter((i) => canOpen(i.to))
    if (open.length < 2) continue
    const [lead, ...rest] = open
    for (const r of rest) dropped.add(r.to)
    leads.set(lead.to, { covers: rest.map((r) => r.to), label: names[entryNameKey(host)] ?? items.find((i) => i.to === host)?.family })
  }
  return items
    .filter((i) => canOpen(i.to) && !dropped.has(i.to))
    .map((i) => {
      const lead = leads.get(i.to)
      return lead ? { ...i, covers: lead.covers, label: lead.label ?? i.label } : i
    })
}

/**
 * The tabs across the top of `pathname`, for this person: the page and
 * the ones beside it that they may open, in the app's order, under the
 * names the church has given them. None when the page has no tabs, when
 * only one is open to them (nothing to switch between), or on a page
 * further in (one team's inventory, one event).
 */
export function pageTabs(
  pathname: string,
  canOpen: (path: string) => boolean,
  names: Record<string, string> = {},
  items: readonly NavItem[] = NAV_ITEMS,
): { name: string; tabs: { to: string; label: string }[] } | null {
  const here = items.find((i) => i.to === pathname)
  if (!here) return null
  const host = here.tab && here.within ? here.within : here.to
  const family = familyOf(items, host).filter((i) => i.to === host || i.tab)
  if (family.length < 2) return null
  const open = family.filter((i) => canOpen(i.to))
  if (open.length < 2) return null
  const hostItem = family[0]
  return {
    name: names[entryNameKey(hostItem.to)] ?? hostItem.family ?? names[hostItem.to] ?? hostItem.label,
    tabs: open.map((i) => ({ to: i.to, label: names[i.to] ?? i.label })),
  }
}

/*
 * The destinations, under five headings that each say one thing.
 *
 * They used to be in the order they were built, which is nobody's order,
 * and then under headings that had grown by accretion: "Sunday" held ten
 * pages, from saying whether you can serve to the stage plan, and a page
 * added later landed wherever its default heading happened to be. The
 * Owner asked for groups with proper names and every page under the one
 * it belongs to, and then for the pages that showed the same people or
 * the same services to be one page with tabs (November 2026). So:
 *
 *   Above the headings: the Dashboard, then the Calendar, where the
 *     services are and the running order it is all pointing at.
 *   Serving: your own part, in the order it reaches you. Say whether you
 *     can serve, see who was put on, tick what is yours, and who arrived.
 *   Services: what a service is made of and what was said about it. Its
 *     songs, where everything stands, its clock, and afterwards.
 *   Communications: what the church is saying, then the teams, then the
 *     questions put to people, and last what people say about the app.
 *   Church Life: praying, giving, and the events people sign up for.
 *   People & Teams: the teams, the people who fill them, and what they keep.
 *
 * A page with `within` and `tab` is drawn as a tab beside the page it
 * names, and the two are one entry in the menu: Issues beside Debriefs
 * ("After the Service"), Songs beside Set Lists, Families and DBS Checks
 * beside Volunteers ("People"), Team Chat beside Messages ("Chat"),
 * Reception beside Registrations. Each is still its own page, with its
 * own address and its own rule for who may open it, so putting one back
 * in the menu is taking those two words off its line.
 *
 * The heading names are the ones the church's own saved menu uses too, so
 * a page added to the app later lands under the same heading in both
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
  // Every team's arrivals on the day (0338): who is here, on the way, or not coming.
  { to: '/on-my-way', label: 'On my way', icon: TimerIcon, group: 'Serving' },

  // What a service is made of. The planner's own entry is kept for
  // somebody the Calendar is closed to (`within`); everybody else reaches
  // the services from the Calendar.
  { to: '/service-planner', label: 'Service Planner', icon: CalendarIcon, group: 'Services', within: '/events' },
  { to: '/set-lists', label: 'Set Lists', icon: MusicIcon, group: 'Services' },
  // Every song the church sings, kept for good (0241, 0243): where the
  // set list's song box finds them, so it is a tab beside the set lists.
  { to: '/songs', label: 'Songs', icon: ListIcon, group: 'Services', within: '/set-lists', tab: true },
  // Where everything stands on the morning, drawn once for everybody.
  { to: '/stage', label: 'Stage Layout', icon: StageIcon, group: 'Services' },
  // The running order's clock, large, for whoever keeps the time.
  { to: '/countdown', label: 'Countdown', icon: TimerIcon, group: 'Services' },
  // And what was said about it afterwards, which is the last step of a
  // Sunday rather than a thing looked up.
  { to: '/debriefs', label: 'Debriefs', icon: NotebookIcon, group: 'Services', family: 'After the Service' },
  // What somebody noticed that a team has to put right. Teams always see
  // it; everybody does once App settings let everybody raise one. Both
  // are about a service that has happened, team by team: one entry.
  { to: '/issues', label: 'Issues', icon: WarningIcon, group: 'Services', within: '/debriefs', tab: true },

  // For everybody, Church Members included: what the church is saying.
  { to: '/updates', label: 'Church Updates', icon: MegaphoneIcon, group: 'Communications' },
  // The teams talking: every team's board, and your own team's room.
  // Nothing in either belongs to somebody who is not on a team yet, so
  // neither is offered until they are.
  { to: '/messages', label: 'Messages', icon: MessageIcon, group: 'Communications', family: 'Chat' },
  { to: '/team-chat', label: 'Team Chat', icon: ChatTeamIcon, group: 'Communications', within: '/messages', tab: true },
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
  // Reception (0247): the door of those events, for whoever works it. A
  // tab beside them; somebody who only works the door has it on its own.
  { to: '/door', label: 'Reception', icon: IdCardIcon, group: 'Church Life', within: '/registrations', tab: true },

  // Looked up rather than lived in: the teams, the people who fill them,
  // and the cupboard they draw on.
  { to: '/departments', label: 'Teams', icon: UsersIcon, group: 'People & Teams' },
  // Three lists of the same people: what they may do, who they are
  // related to, and where their DBS stands.
  { to: '/volunteers', label: 'Volunteers', icon: IdCardIcon, group: 'People & Teams', family: 'People' },
  // Who is linked to whom, drawn as a tree, and linking more (0326): whoever may link families.
  { to: '/families', label: 'Families', icon: FamilyTreeIcon, group: 'People & Teams', within: '/volunteers', tab: true },
  // Everybody's DBS and marking one verified (0324): the Owner's, and whoever is given it.
  { to: '/dbs', label: 'DBS Checks', icon: ShieldIcon, group: 'People & Teams', within: '/volunteers', tab: true },
  { to: '/inventory', label: 'Inventory', icon: BoxIcon, group: 'People & Teams' },
]

import type { DockItem } from '../components/DockNav'
import {
  BoxIcon,
  CakeIcon,
  GiftHeartIcon,
  CalendarIcon,
  ChecklistIcon,
  NotebookIcon,
  ClipboardUserIcon,
  MusicIcon,
  GridIcon,
  IdCardIcon,
  ChatTeamIcon,
  MegaphoneIcon,
  PollIcon,
  WarningIcon,
  MessageIcon,
  UserCheckIcon,
  UsersIcon,
} from '../components/icons'

/**
 * A destination. Who it is offered to is lib/pageAccess's (the church's
 * choice); where it sits is lib/navLayout's.
 */
export type NavItem = DockItem

/*
 * The destinations, in the order a Sunday actually happens.
 *
 * They used to be in the order they were built, which is nobody's order:
 * Checklists before Availability, though you answer weeks before you tick
 * anything; Set Lists three places from the Service Planner it belongs
 * to; Team Chat at the far end from Messages.
 *
 * Four runs, and the reason for each:
 *
 *   1. Where am I, and what is the morning: the dashboard, then the
 *      running order it is all pointing at. The planner is second because
 *      it is the thing most often opened on purpose — the shape of the
 *      service is what everything else hangs off.
 *   2. Your Sunday, in the order it reaches you: say whether you can serve,
 *      see who was put on, tick what you have done on the day — and the
 *      songs, which the worship team reaches for last of those.
 *   3. Talking about it.
 *   4. The reference pages you visit rarely and on purpose — the diary,
 *      the teams, the people, the cupboard.
 *
 * The dock's phone window slides along this list (lib/dockWindow), so the
 * order is not only a menu but the path along it: from Availability the
 * next step right is the rota built from it, and the one after is the
 * checklist for the morning. Getting it wrong costs a tap every time.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: GridIcon },
  { to: '/service-planner', label: 'Service Planner', icon: CalendarIcon, group: 'Sunday' },

  // Your Sunday, in the order it happens to you, ending with the songs.
  { to: '/availability', label: 'Availability', icon: UserCheckIcon, group: 'Sunday' },
  { to: '/rota', label: 'Team Rota', icon: ClipboardUserIcon, group: 'Sunday' },
  { to: '/checklists', label: 'Checklists', icon: ChecklistIcon, group: 'Sunday' },
  { to: '/set-lists', label: 'Set Lists', icon: MusicIcon, group: 'Sunday' },
  // And what was said about it afterwards, which is the last step of a
  // Sunday rather than a thing looked up.
  { to: '/debriefs', label: 'Debriefs', icon: NotebookIcon, group: 'After the service' },
  // What somebody noticed that a team has to put right. Teams always see
  // it; everybody does once App settings let everybody raise one.
  { to: '/issues', label: 'Issues', icon: WarningIcon, group: 'After the service' },

  // Talking about it. Nothing in either belongs to somebody who is not on
  // a team yet, so neither is offered until they are.
  { to: '/messages', label: 'Messages', icon: MessageIcon, group: 'Talk' },
  { to: '/team-chat', label: 'Team Chat', icon: ChatTeamIcon, group: 'Talk' },
  // For everybody, Church Members included: what the church is saying,
  // and what it is asking.
  { to: '/updates', label: 'Church Updates', icon: MegaphoneIcon, group: 'Talk' },
  { to: '/polls', label: 'Polls', icon: PollIcon, group: 'Talk' },

  // Looked up rather than lived in: the diary, the teams, the people who
  // fill them, and the cupboard they draw on.
  { to: '/events', label: 'Events', icon: CakeIcon, group: 'Church life' },
  { to: '/giving', label: 'Giving', icon: GiftHeartIcon, group: 'Church life' },
  { to: '/departments', label: 'Teams', icon: UsersIcon, group: 'People & things' },
  { to: '/volunteers', label: 'Volunteers', icon: IdCardIcon, group: 'People & things' },
  { to: '/inventory', label: 'Inventory', icon: BoxIcon, group: 'People & things' },
]

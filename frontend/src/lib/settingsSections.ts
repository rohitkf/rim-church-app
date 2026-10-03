import type { ComponentType } from 'react'
import type { BadgeTone } from '../components/Surface'
import {
  ArchiveIcon,
  ClipboardUserIcon,
  GridIcon,
  GiftHeartIcon,
  ImageIcon,
  ListIcon,
  MegaphoneIcon,
  PaletteIcon,
  ShieldIcon,
  TimerIcon,
  TrashIcon,
  UserCircleIcon,
} from '../components/icons'

/**
 * Every room in Settings, in the order and the groups a person meets them.
 *
 * One list, read by the Settings home, its sidebar and the search — so a
 * room cannot be added to one of them and forgotten in the others.
 *
 * Grouped by whose it is rather than by what kind of control it holds:
 * yours, the church's set-up, the people tools an Admin reaches for, and
 * the two that belong to the owner alone.
 */

export type SettingsNeeds = 'admin' | 'owner'

export interface SettingsSection {
  to: string
  label: string
  /** One line, in the words of the job — never a list of its controls. */
  blurb: string
  icon: ComponentType<{ className?: string; width?: number; height?: number }>
  tone: BadgeTone
  /** Who it is for. Everybody, unless it says otherwise. */
  needs?: SettingsNeeds
  /** The one that destroys things. Dressed as such, so it never gets
      clicked on the way to somewhere else. */
  danger?: boolean
  /** Extra words the search should find it by. */
  keywords?: string
}

export interface SettingsGroup {
  heading: string
  sections: SettingsSection[]
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    heading: 'You',
    sections: [
      {
        to: '/settings/profile',
        label: 'Profile',
        blurb: 'Your name, how to reach you, and the dates we celebrate.',
        icon: UserCircleIcon,
        tone: 'blue',
        keywords: 'profile account name phone birthday anniversary dbs visa',
      },
      {
        to: '/settings/appearance',
        label: 'Appearance & alerts',
        blurb: 'Light or dark, how teams are drawn, and phone notifications.',
        icon: PaletteIcon,
        tone: 'indigo',
        keywords: 'theme dark light mode team style gradient dot notifications push',
      },
    ],
  },
  {
    heading: 'Church set-up',
    sections: [
      {
        to: '/settings/timings',
        label: 'Timings',
        blurb: 'When things open, close and clear.',
        icon: TimerIcon,
        tone: 'green',
        needs: 'admin',
        keywords: 'app settings clocks windows rota window grace debrief issues availability deadline timezone',
      },
      {
        to: '/settings/retention',
        label: 'Data & retention',
        blurb: 'How long each page keeps things, and when it clears.',
        icon: ArchiveIcon,
        tone: 'orange',
        needs: 'admin',
        keywords: 'retention delete clear keep history notifications chat polls updates debriefs issues board',
      },
      {
        to: '/settings/display',
        label: 'Dashboard & lists',
        blurb: 'What the Dashboard shows, and what starts open.',
        icon: GridIcon,
        tone: 'blue',
        needs: 'admin',
        keywords: 'dashboard display collapsed expanded folded open services days window',
      },
      {
        to: '/settings/rota',
        label: 'Team Rota',
        blurb: 'Role tags, and how the Team Coordinator stands out.',
        icon: ClipboardUserIcon,
        tone: 'blue',
        needs: 'admin',
        keywords: 'tags shadow coordinator colour sky',
      },
      {
        to: '/settings/giving',
        label: 'Giving',
        blurb: 'Links, a QR code and bank details for Tithes & offerings.',
        icon: GiftHeartIcon,
        tone: 'green',
        needs: 'admin',
        keywords: 'tithes offerings stripe paypal bank sort code qr',
      },
      {
        to: '/settings/menu',
        label: 'Menu',
        blurb: 'How the More menu is arranged, for everybody.',
        icon: ListIcon,
        tone: 'indigo',
        needs: 'admin',
        keywords: 'navigation more menu groups order arrange',
      },
    ],
  },
  {
    heading: 'People',
    sections: [
      {
        to: '/settings/access',
        label: 'Access & privileges',
        blurb: 'Who can open each page, and who can do what.',
        icon: ShieldIcon,
        tone: 'indigo',
        needs: 'admin',
        keywords: 'permissions roles admin head coordinator member pages profiles church member see hide',
      },
      {
        to: '/settings/alerts',
        label: 'Send an alert',
        blurb: 'Interrupt everybody, a team, or a few people.',
        icon: MegaphoneIcon,
        tone: 'orange',
        needs: 'admin',
        keywords: 'announcement broadcast urgent',
      },
    ],
  },
  {
    heading: 'Owner only',
    sections: [
      {
        to: '/settings/logo',
        label: 'App logo',
        blurb: 'The mark at the top of every page.',
        icon: ImageIcon,
        tone: 'blue',
        needs: 'owner',
        keywords: 'logo brand mark image',
      },
      {
        to: '/settings/data',
        label: 'Erase data',
        blurb: 'Clear the app back to an empty diary.',
        icon: TrashIcon,
        tone: 'red',
        needs: 'owner',
        danger: true,
        keywords: 'reset delete clear',
      },
    ],
  },
]

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.sections)

/** Whether somebody of this standing may open a room. */
export function maySee(section: SettingsSection, standing: { isAdmin: boolean; isSuperAdmin: boolean }) {
  if (section.needs === 'owner') return standing.isSuperAdmin
  if (section.needs === 'admin') return standing.isAdmin
  return true
}

/**
 * The groups somebody actually has a door in. A menu of doors that will
 * not open is worse than no menu, because it invites somebody to ask why —
 * and a heading over nothing is the same mistake one level up.
 */
export function visibleGroups(standing: { isAdmin: boolean; isSuperAdmin: boolean }): SettingsGroup[] {
  return SETTINGS_GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => maySee(s, standing)) })).filter(
    (g) => g.sections.length > 0,
  )
}

/** The room a path is in, whoever is asking. */
export function sectionFor(pathname: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => pathname === s.to || pathname.startsWith(`${s.to}/`))
}

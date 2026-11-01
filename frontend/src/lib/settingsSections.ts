import type { ComponentType } from 'react'
import type { BadgeTone } from '../components/Surface'
import type { CapabilityKey } from './permissions'
import { QuestionIcon,
  ChecklistIcon,
  ClipboardUserIcon,
  EyeIcon,
  MapPinIcon,
  PrayIcon,
  SparklesIcon,
  GiftHeartIcon,
  ImageIcon,
  ListIcon,
  MegaphoneIcon,
  PaletteIcon,
  ShieldIcon,
  StageIcon,
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
 * yours, the church's set-up, who may do what, the tools an Admin reaches
 * for, and the two that belong to the owner alone. Each choice lives in
 * one room: a page's clocks, what it keeps and what it shows are its own,
 * in Page by Page, not a second room each.
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
  /**
   * When the room is one permission in the church's grid, that one: the
   * room is open to whoever holds it, Admin or not (Settings › Access &
   * privileges). Rooms without one stay with their `needs`.
   */
  capability?: CapabilityKey
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
        label: 'Appearance & Alerts',
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
        to: '/settings/pages',
        label: 'Page by Page',
        blurb: 'Each page’s clocks, what it keeps and shows, and who may do what on it — team by team.',
        icon: ChecklistIcon,
        tone: 'indigo',
        needs: 'admin',
        // Timings, Data & Retention and Dashboard & Lists were rooms of
        // their own, each a second way to the same rows; they live here now.
        keywords:
          'page settings access team rules head assisting member rota availability dashboard planner timings clocks windows grace debrief issues deadline timezone retention delete clear keep history notifications chat polls updates board display collapsed expanded folded open services days',
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
        capability: 'give.edit',
        keywords: 'tithes offerings stripe paypal bank sort code qr',
      },
      {
        to: '/settings/stage',
        label: 'Stage Layout',
        blurb: 'Which teams may draw the stage, and when layouts clear.',
        icon: StageIcon,
        tone: 'blue',
        needs: 'admin',
        keywords: 'stage layout band positions templates clear tuesday',
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
    heading: 'People & permissions',
    sections: [
      {
        to: '/settings/access',
        label: 'Access & Privileges',
        blurb: 'Who can open each page, and who can do what.',
        icon: ShieldIcon,
        tone: 'indigo',
        needs: 'admin',
        keywords: 'permissions roles admin head coordinator member pages profiles church member see hide person someone why',
      },
      {
        to: '/settings/overwatch',
        label: 'Overwatch',
        blurb: 'Which pages Overwatch sees, and what it may post or raise.',
        icon: EyeIcon,
        tone: 'indigo',
        needs: 'admin',
        keywords: 'overwatch read only observer elder pastor watch see everything',
      },
      {
        to: '/settings/clock-in',
        label: 'Clock in',
        blurb: 'When it opens, how near counts, who sees it and who approves.',
        icon: MapPinIcon,
        tone: 'green',
        needs: 'admin',
        keywords: 'clock in attendance arrival location gps geolocation radius present check in',
      },
      {
        to: '/settings/prayer',
        label: 'Prayer',
        blurb: 'Who reads private requests, asks people to pray, and runs prayer lists.',
        icon: PrayIcon,
        tone: 'indigo',
        needs: 'admin',
        keywords: 'prayer requests pastor pastors private testimonies chain prayer',
      },
    ],
  },
  {
    heading: 'Tools',
    sections: [
      {
        to: '/settings/onboarding',
        label: 'Onboarding',
        blurb: 'Send the tour of the app to everyone, or to a few.',
        icon: SparklesIcon,
        tone: 'blue',
        needs: 'admin',
        capability: 'people.onboard',
        keywords: 'tour tutorial welcome walkthrough new intro guide',
      },
      {
        to: '/settings/alerts',
        label: 'Send an Alert',
        blurb: 'Interrupt everybody, a team, or a few people.',
        icon: MegaphoneIcon,
        tone: 'orange',
        needs: 'admin',
        capability: 'msg.alert',
        keywords: 'announcement broadcast urgent',
      },
    ],
  },
  {
    heading: 'Owner only',
    sections: [
      {
        to: '/settings/logo',
        label: 'App Logo',
        blurb: 'The mark at the top of every page.',
        icon: ImageIcon,
        tone: 'blue',
        needs: 'owner',
        keywords: 'logo brand mark image',
      },
      {
        to: '/settings/video',
        label: 'Video Tutorial',
        blurb: 'The link behind Video tutorial in everybody’s account menu.',
        icon: QuestionIcon,
        tone: 'blue',
        needs: 'owner',
        keywords: 'video tutorial help how to youtube link',
      },
      {
        to: '/settings/data',
        label: 'Erase Data',
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

/** Who is asking: their standing, and — when it is known — the grid's answer. */
export interface SettingsStanding {
  isAdmin: boolean
  isSuperAdmin: boolean
  can?: (cap: CapabilityKey) => boolean
}

/** Whether somebody of this standing may open a room. */
export function maySee(section: SettingsSection, standing: SettingsStanding) {
  if (section.capability && standing.can) return standing.can(section.capability)
  if (section.needs === 'owner') return standing.isSuperAdmin
  if (section.needs === 'admin') return standing.isAdmin
  return true
}

/**
 * The groups somebody actually has a door in. A menu of doors that will
 * not open is worse than no menu, because it invites somebody to ask why —
 * and a heading over nothing is the same mistake one level up.
 */
export function visibleGroups(standing: SettingsStanding): SettingsGroup[] {
  return SETTINGS_GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => maySee(s, standing)) })).filter(
    (g) => g.sections.length > 0,
  )
}

/** The room a path is in, whoever is asking. */
export function sectionFor(pathname: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => pathname === s.to || pathname.startsWith(`${s.to}/`))
}

import type { ComponentType } from 'react'
import type { BadgeTone } from '../components/Surface'
import type { CapabilityKey } from './permissions'
import { QuestionIcon,
  ActivityIcon,
  FeedbackIcon,
  SettingsIcon,
  BellIcon,
  ChecklistIcon,
  ClipboardUserIcon,
  EyeIcon,
  MapPinIcon,
  PrayIcon,
  SparklesIcon,
  GiftHeartIcon,
  ImageIcon,
  ListIcon,
  LockIcon,
  MegaphoneIcon,
  PaletteIcon,
  ShieldIcon,
  StageIcon,
  WarningIcon,
  TrashIcon,
  UserCircleIcon,
} from '../components/icons'

/**
 * Every room in Settings, in the order and the groups a person meets them.
 *
 * One list, read by the Settings home, its sidebar and the search — so a
 * room cannot be added to one of them and forgotten in the others.
 *
 * Six groups, and each room in exactly one (the Owner's redesign, November
 * 2026): You; Access — who can do what; Church — set once for everybody;
 * Pages — each page's own settings; Tools — things you do rather than
 * settings you leave; and the app itself — its face, its help link, its
 * mailbox and the button that empties it, the Owner's out of the box and
 * anybody's the Owner gives them to (0277). Each choice lives in
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
   * The room's own row in the church's grid (0277): it opens to whoever
   * holds it — a role's cell, or a team or a person given it by name —
   * Admin or not. Only your own three rooms have none. `needs` is who that
   * is out of the box, and what is asked while the grid is not known.
   */
  capability?: CapabilityKey
  /**
   * Other rows that open the room too: part of what it holds is theirs.
   * Page by Page, say, is each page's settings (its own row) and each
   * page's rules (the grid's), and either is reason to come in.
   */
  also?: readonly CapabilityKey[]
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
        label: 'Appearance',
        blurb: 'Light or dark, and how teams are drawn.',
        icon: PaletteIcon,
        tone: 'indigo',
        keywords: 'theme dark light mode team style gradient dot',
      },
      {
        to: '/settings/notifications',
        label: 'Notifications',
        blurb: 'What buzzes your phone.',
        icon: BellIcon,
        tone: 'blue',
        keywords: 'notifications push phone alerts buzz bell device mute',
      },
    ],
  },
  {
    heading: 'Access',
    sections: [
      {
        to: '/settings/access',
        label: 'Access & Privileges',
        blurb: 'Who can open each page, and who can do what.',
        icon: ShieldIcon,
        tone: 'indigo',
        needs: 'admin',
        capability: 'app.permissions',
        keywords: 'permissions roles admin head coordinator member pages profiles church member see hide person someone why',
      },
      {
        to: '/settings/overwatch',
        label: 'Overwatch',
        blurb: 'Which pages Overwatch sees, and what it may post or raise.',
        icon: EyeIcon,
        tone: 'indigo',
        needs: 'admin',
        capability: 'settings.overwatch',
        also: ['app.permissions'],
        keywords: 'overwatch read only observer elder pastor watch see everything',
      },
    ],
  },
  {
    heading: 'Church',
    sections: [
      {
        to: '/settings/general',
        label: 'General',
        blurb: 'The church’s time zone, and the bell.',
        icon: SettingsIcon,
        tone: 'indigo',
        needs: 'admin',
        capability: 'settings.general',
        keywords: 'general timezone time zone clock bell notifications keep cleared church wide',
      },
      {
        to: '/settings/menu',
        label: 'Menu',
        blurb: 'How the More menu is arranged, for everybody.',
        icon: ListIcon,
        tone: 'indigo',
        needs: 'admin',
        capability: 'settings.menu',
        keywords: 'navigation more menu groups order arrange',
      },
    ],
  },
  {
    heading: 'Pages',
    sections: [
      {
        to: '/settings/pages',
        label: 'Page by Page',
        blurb: 'Each page’s clocks, what it keeps and shows, and who may do what on it — team by team.',
        icon: ChecklistIcon,
        tone: 'indigo',
        needs: 'admin',
        capability: 'settings.pages',
        also: ['app.permissions'],
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
        capability: 'settings.rota',
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
        capability: 'settings.stage',
        also: ['app.permissions'],
        keywords: 'stage layout band positions templates clear tuesday',
      },
      {
        to: '/settings/clock-in',
        label: 'Clock in',
        blurb: 'When it opens, how near counts, who sees it and who approves.',
        icon: MapPinIcon,
        tone: 'green',
        needs: 'admin',
        capability: 'settings.clockin',
        also: ['app.permissions', 'people.onboard'],
        keywords: 'clock in attendance arrival location gps geolocation radius present check in',
      },
      {
        to: '/settings/reception',
        label: 'Reception',
        blurb: 'Lock and unlock it, who works the door and what each may press.',
        icon: LockIcon,
        tone: 'orange',
        needs: 'admin',
        // The key is whoever runs registrations'; who has the door is the grid's.
        capability: 'reg.manage',
        also: ['app.permissions'],
        keywords: 'reception door lock unlock check in scan tickets walk-in payments undo registrations event',
      },
      {
        to: '/settings/prayer',
        label: 'Prayer',
        blurb: 'Who reads private requests, asks people to pray, and runs prayer lists.',
        icon: PrayIcon,
        tone: 'indigo',
        needs: 'admin',
        capability: 'settings.prayer',
        also: ['app.permissions'],
        keywords: 'prayer requests pastor pastors private testimonies chain prayer',
      },
    ],
  },
  {
    heading: 'Tools',
    sections: [
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
      {
        to: '/settings/notices',
        label: 'App Notices',
        blurb: 'A line at the top of every page for everybody: information, a warning, or maintenance that closes the app.',
        icon: WarningIcon,
        tone: 'orange',
        needs: 'owner',
        capability: 'settings.notices',
        keywords: 'notice banner information warning maintenance closed disable downtime announce everyone',
      },
      {
        to: '/settings/onboarding',
        label: 'Onboarding',
        blurb: 'Who has set up what — details, tour, location, notifications — and asking the rest. Send the tour.',
        icon: SparklesIcon,
        tone: 'blue',
        needs: 'admin',
        capability: 'people.onboard',
        keywords: 'tour tutorial welcome walkthrough new intro guide profile details complete setup location notifications installed',
      },
    ],
  },
  {
    heading: 'The app itself',
    sections: [
      {
        to: '/settings/logo',
        label: 'App Logo',
        blurb: 'The mark at the top of every page, and the installed app’s icon.',
        icon: ImageIcon,
        tone: 'blue',
        needs: 'owner',
        capability: 'settings.logo',
        keywords: 'logo brand mark image icon install home screen favicon',
      },
      {
        to: '/settings/video',
        label: 'Video Tutorial',
        blurb: 'The link behind Video tutorial in everybody’s account menu.',
        icon: QuestionIcon,
        tone: 'blue',
        needs: 'owner',
        capability: 'settings.video',
        keywords: 'video tutorial help how to youtube link',
      },
      {
        to: '/settings/feedback',
        label: 'Feedback',
        blurb: 'How long settled feedback is kept.',
        icon: FeedbackIcon,
        tone: 'blue',
        needs: 'owner',
        capability: 'settings.feedback',
        keywords: 'feedback bug suggestion retention kept settled done',
      },
      {
        to: '/settings/health',
        label: 'App Health',
        blurb: 'What has gone wrong: errors on people’s devices, timed jobs and notifications that failed.',
        icon: ActivityIcon,
        tone: 'green',
        needs: 'owner',
        capability: 'settings.health',
        keywords: 'health errors error log crash broken bug failed failure jobs cron push uptime status monitoring reference',
      },
      {
        to: '/settings/data',
        label: 'Erase Data',
        blurb: 'Clear the app back to an empty diary.',
        icon: TrashIcon,
        tone: 'red',
        needs: 'owner',
        capability: 'settings.erase',
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
  if (section.capability && standing.can) {
    const can = standing.can
    return can(section.capability) || (section.also ?? []).some((cap) => can(cap))
  }
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

import type { ComponentType, SVGProps } from 'react'
import { BellIcon, MegaphoneIcon, SettingsIcon } from '../components/icons'
import { NAV_ITEMS } from './navItems'
import { SERVING_TABS } from './serving'
import { type Capability, type PermissionArea } from './permissionMatrix'
import { ALERTS, APP, BELL, affectsPage } from './settingsCatalog'
import { TEAM_ROLES, isTeamSettable } from './permissions'

/**
 * Settings › Page by page: the pages, in the order of the menu, and what
 * each one owns.
 *
 * A page's section gathers the settings that move it (lib/settingsCatalog,
 * by `affects`), the rules about it (lib/permissionMatrix, by an area's
 * `pages` or a row's own `at`), who may open it (lib/pageAccess), and the
 * rooms that hold its own controls. Three places that are not pages in the
 * menu come last — the bell, Send an alert, and the app itself — so that
 * nothing the church can set is left out.
 */

export interface SettingsPage {
  to: string
  label: string
  /** The heading it sits under: the menu's group, or "Everywhere" for the three that are not pages. */
  group: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const SETTINGS_PAGES: SettingsPage[] = [
  ...NAV_ITEMS.flatMap((item): SettingsPage[] =>
    item.tabs
      ? item.tabs.map((to) => ({
          to,
          label: SERVING_TABS.find((t) => t.to === to)?.label ?? to,
          group: item.group ?? 'Home',
          icon: item.icon,
        }))
      : [{ to: item.to, label: item.label, group: item.group ?? 'Home', icon: item.icon }],
  ),
  { to: BELL, label: 'Notifications', group: 'Everywhere', icon: BellIcon },
  { to: ALERTS, label: 'Send an alert', group: 'Everywhere', icon: MegaphoneIcon },
  { to: APP, label: 'The app itself', group: 'Everywhere', icon: SettingsIcon },
]

/** A page's anchor: `#rota`, `#service-planner`, `#dashboard`. */
export function pageSlug(to: string): string {
  if (to === '/') return 'dashboard'
  return to.replace(/^\//, '')
}

/** The page an anchor names, if any. */
export function pageForSlug(slug: string): SettingsPage | undefined {
  return SETTINGS_PAGES.find((p) => pageSlug(p.to) === slug)
}

/** Whether a row is about this page: its own `at`, else its area's pages. */
function rowIsAbout(area: PermissionArea, c: Capability, to: string): boolean {
  return (c.at ?? area.pages).some((ref) => affectsPage(ref, to))
}

/** The areas, trimmed to the rows about this page; an area with none is dropped. */
export function capabilitiesFor(areas: PermissionArea[], to: string): PermissionArea[] {
  return areas
    .map((area) => ({ ...area, capabilities: area.capabilities.filter((c) => rowIsAbout(area, c, to)) }))
    .filter((area) => area.capabilities.length > 0)
}

/** The rows a team can set for itself: one with a cell for one of its own profiles. */
export function teamRows(areas: PermissionArea[]): Capability[] {
  return areas.flatMap((a) => a.capabilities).filter((c) => !!c.key && TEAM_ROLES.some((role) => isTeamSettable(c.key!, role)))
}

/**
 * The rooms with a page's own controls — the ones that are more than a
 * row (the rota's tags, the Giving links, which teams may draw the stage).
 */
export const PAGE_ROOMS: Record<string, { to: string; label: string; blurb: string }[]> = {
  '/rota': [{ to: '/settings/rota', label: 'Team Rota', blurb: 'Role tags, and how the Team Coordinator stands out.' }],
  '/giving': [{ to: '/settings/giving', label: 'Giving', blurb: 'Links, a QR code and bank details.' }],
  '/stage': [{ to: '/settings/stage', label: 'Stage layout', blurb: 'Which teams may draw, the areas, and the template library.' }],
  '/volunteers': [{ to: '/settings/onboarding', label: 'Onboarding', blurb: 'Send the tour of the app, and see who has taken it.' }],
  [ALERTS]: [{ to: '/settings/alerts', label: 'Send an alert', blurb: 'Send one, and the record of what went out.' }],
  [APP]: [
    { to: '/settings/menu', label: 'Menu', blurb: 'How the More menu is arranged, for everybody.' },
    { to: '/settings/access', label: 'Access & privileges', blurb: 'The same rules, a role at a time — and every page’s opening rule in one list.' },
  ],
}

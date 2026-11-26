import { NavLink, useLocation } from 'react-router-dom'
import { pageTabs } from '../lib/navItems'
import { useNavNames } from '../lib/navNames'
import { usePageAccess } from '../lib/usePageAccess'
import { segmentClasses, segmentTrackClasses } from './Surface'

/**
 * The tabs across the top of pages that are one entry in the menu.
 *
 * Debriefs and Issues are both about a service that has happened, team by
 * team; Volunteers, Families and DBS Checks are three lists of the same
 * people. Each pair or three was a separate trip to the menu. They are one
 * entry now, and this strip is how you move between them (the Owner,
 * November 2026). Which pages go together is lib/navItems' (`within`,
 * `tab`), so the menu and the strip cannot disagree.
 *
 * Each tab is still its own page at its own address, behind its own rule:
 * only the ones this person may open are drawn, under the names the church
 * has given them, and with one left there is nothing to switch between, so
 * no strip is drawn at all. It is not drawn on a page further in either
 * (one event, one team's inventory), where it would offer a way out that
 * looks like a way across.
 */
export function PageTabs() {
  const { pathname } = useLocation()
  const { canOpen } = usePageAccess()
  const names = useNavNames()
  const found = pageTabs(pathname, canOpen, names)
  if (!found) return null

  return (
    <nav aria-label={found.name} data-tour="page-tabs" className="mb-5 mt-1">
      {/* A segmented control whose segments are links: they share the width
          on a phone and sit as one object from sm up. */}
      <ul className={`${segmentTrackClasses} sm:inline-grid sm:w-auto`}>
        {found.tabs.map((tab) => (
          <li key={tab.to} className="min-w-0">
            <NavLink to={tab.to} end title={tab.label} className={({ isActive }) => segmentClasses(isActive, undefined, 'px-2 sm:px-4', 'tab')}>
              <span className="truncate whitespace-nowrap">{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

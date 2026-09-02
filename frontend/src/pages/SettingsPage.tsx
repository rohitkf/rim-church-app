import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/Surface'
import { AdminResetCard } from '../components/AdminResetCard'
import { AppSettingsCard } from '../components/AppSettingsCard'
import { PermissionsCard } from '../components/PermissionsCard'

/**
 * Settings, in rooms rather than one long corridor.
 *
 * This was a single scroll: your name, then the church's clocks, then who
 * can do what, then the button that erases everything. Four unrelated
 * jobs, and the last of them sitting a flick below the first is not where
 * it belongs.
 *
 * Each is its own page now, with its own address, so "the timings page"
 * can be sent to somebody rather than described.
 *
 * What a person sees is only what they may use. An ordinary member finds
 * their profile and nothing else — a menu of doors that will not open is
 * worse than no menu, because it invites somebody to ask why.
 */

interface SettingsSection {
  to: string
  label: string
  blurb: string
  /** Who it is for. Everybody, unless it says otherwise. */
  needs?: 'admin' | 'owner'
  /** The one that destroys things. Dressed as such, so it never gets
      clicked on the way to somewhere else. */
  danger?: boolean
}

const SECTIONS: SettingsSection[] = [
  { to: '/settings/profile', label: 'Profile', blurb: 'Your name, contact details and dates.' },
  {
    to: '/settings/access',
    label: 'Access & privileges',
    blurb: 'Who can do what, across the whole app.',
    needs: 'admin',
  },
  {
    to: '/settings/church',
    label: 'App settings',
    blurb: 'The church’s own clocks and windows.',
    needs: 'admin',
  },
  {
    to: '/settings/data',
    label: 'Erase data',
    blurb: 'Clear the app back to an empty diary.',
    needs: 'owner',
    danger: true,
  },
]

export function SettingsPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const sections = SECTIONS.filter((s) =>
    s.needs === 'owner' ? isSuperAdmin : s.needs === 'admin' ? isAdmin : true,
  )

  return (
    <div>
      <PageHeader title="Settings" description="Your account, and how the church’s app behaves." />

      {/* A column on a wide screen, a row of chips on a phone. A vertical
          menu above the content on a phone would push the thing you came
          for below the fold every time. */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:gap-8">
        <nav
          aria-label="Settings sections"
          className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-60 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {sections.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              className={({ isActive }) =>
                `tap shrink-0 rounded-[var(--radius-chip)] px-3.5 py-2.5 transition-colors duration-300 lg:shrink ${
                  section.danger
                    ? isActive
                      ? 'bg-gradient-to-r from-error/35 via-error/20 to-transparent text-on-surface ring-1 ring-inset ring-error/50'
                      : 'bg-gradient-to-r from-error/15 to-transparent text-error hover:from-error/25 hover:text-on-surface'
                    : isActive
                      ? 'bg-secondary-container text-on-surface'
                      : 'text-on-surface-variant hover:bg-raised hover:text-on-surface'
                }`
              }
            >
              <span className="block whitespace-nowrap text-body-md font-medium lg:whitespace-normal">
                {section.label}
              </span>
              {/* Room for the sentence only where there is room: on a phone
                  these are chips in a scrolling row. */}
              <span
                className={`hidden text-label-sm lg:block ${
                  section.danger ? 'text-error/70' : 'text-on-surface-faint'
                }`}
              >
                {section.blurb}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Centred, and capped at a width a form can be read across.
            Left to fill 1440px the profile's fields ran the width of a
            desk and the page looked like a card with a wasteland beside
            it; each pane now fills this column edge to edge. */}
        <div className="mx-auto w-full min-w-0 max-w-4xl flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Who can do what. The card carries its own heading and disclosure. */
export function AccessSettingsPane() {
  return <PermissionsCard />
}

/** The church's clocks: rota window, lead-in, the day the board clears. */
export function ChurchSettingsPane() {
  return <AppSettingsCard />
}

/** The one that empties the diary. Owner only, and it says so itself. */
export function EraseDataPane() {
  return <AdminResetCard />
}

import { useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Eyebrow, IconBadge, PageHeader, Tile } from '../components/Surface'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { AdminResetCard } from '../components/AdminResetCard'
import { RotaLookCard } from '../components/RotaLookCard'
import { GivingSettingsCard } from '../components/GivingSettingsCard'
import { NavLayoutCard } from '../components/NavLayoutCard'
import { AppSettingsCard } from '../components/AppSettingsCard'
import { PermissionsCard } from '../components/PermissionsCard'
import { SendAlertCard } from '../components/SendAlertCard'
import { AppLogoCard } from '../components/AppLogoCard'
import { AppearanceCard } from '../components/AppearanceCard'
import { PageAccessCard } from '../components/PageAccessCard'
import { RetentionCard } from '../components/RetentionCard'
import { DisplayCard } from '../components/DisplayCard'
import { useAppSettings } from '../lib/appSettings'
import { withPageAccess } from '../lib/permissionMatrix'
import type { PageAccess } from '../lib/pageAccess'
import {
  maySee,
  sectionFor,
  visibleGroups,
  type SettingsGroup,
  type SettingsSection,
} from '../lib/settingsSections'

/**
 * Settings, as a set of rooms off one hall.
 *
 * It began as one long corridor — your name, the church's clocks, who can
 * do what, and the button that erases everything, a flick apart — and then
 * as six rooms, one of which (App settings) was itself four long cards on
 * a single scroll. Too much in too few places.
 *
 * Now `/settings` is the hall: every room, grouped by whose it is, each
 * with a glyph, a name and one line. A room is its own page with its own
 * address, so "the Giving settings" can be sent to somebody rather than
 * described. On a wide screen the hall stays beside you as a sidebar; on a
 * phone it gets out of the way and a room has a way back to it instead.
 *
 * What a person sees is only what they may use. An ordinary member finds
 * their own two rooms and nothing else.
 */
export function SettingsPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const { pathname } = useLocation()
  const groups = visibleGroups({ isAdmin, isSuperAdmin })
  const current = sectionFor(pathname)

  // An address that is no room — the old App settings, a typo — goes
  // through the router, whose routes for those send it somewhere real.
  if (!current && pathname.replace(/\/+$/, '') !== '/settings') return <Outlet />

  // The hall itself.
  if (!current) {
    return (
      <div>
        <PageHeader
          eyebrow="Your account & the church"
          title="Settings"
          description="Pick a room. Each one does one job."
        />
        <SettingsHome groups={groups} />
      </div>
    )
  }

  // A room this person has no key to: back to the hall, not an empty page.
  if (!maySee(current, { isAdmin, isSuperAdmin })) return <Navigate to="/settings" replace />

  return (
    <div>
      {/* On a phone the hall is a page away, so the room carries the way
          back. On a wide screen the sidebar is the way back. */}
      <Link
        to="/settings"
        className="tap -ml-2 mb-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-label-md text-on-surface-variant transition-colors hover:text-on-surface lg:hidden"
      >
        <ChevronLeftIcon width={16} height={16} aria-hidden="true" />
        All settings
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav aria-label="Settings sections" className="hidden shrink-0 lg:block lg:w-60">
          <Link
            to="/settings"
            className="mb-4 block text-headline-md text-on-surface transition-colors hover:text-accent-blue-soft"
          >
            Settings
          </Link>
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.heading}>
                <Eyebrow className="px-3">{group.heading}</Eyebrow>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {group.sections.map((section) => (
                    <li key={section.to}>
                      <SidebarLink section={section} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="w-full min-w-0 max-w-4xl flex-1">
          <header className="mb-6 flex items-start gap-4">
            <IconBadge icon={current.icon} tone={current.tone} size="lg" className="mt-1" />
            <div className="min-w-0">
              <Eyebrow>Settings</Eyebrow>
              <h1 className="mt-1 text-headline-lg">{current.label}</h1>
              <p className="mt-1 text-body-md text-on-surface-variant">{current.blurb}</p>
            </div>
          </header>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function SidebarLink({ section }: { section: SettingsSection }) {
  return (
    <NavLink
      to={section.to}
      className={({ isActive }) =>
        `tap flex items-center gap-3 rounded-[var(--radius-chip)] px-3 py-2 text-body-sm transition-colors duration-300 ${
          isActive
            ? section.danger
              ? 'bg-[color-mix(in_oklab,var(--color-accent-red)_16%,transparent)] text-on-surface'
              : 'bg-secondary-container text-on-surface'
            : section.danger
              ? 'text-error hover:bg-raised'
              : 'text-on-surface-variant hover:bg-raised hover:text-on-surface'
        }`
      }
    >
      <IconBadge icon={section.icon} tone={section.tone} size="sm" />
      <span className="min-w-0 flex-1 font-medium">{section.label}</span>
    </NavLink>
  )
}

/**
 * The hall: who you are at the top, then every room you can open, a group
 * to a tile, the way a phone's own settings read.
 */
function SettingsHome({ groups }: { groups: SettingsGroup[] }) {
  const { profile } = useAuth()
  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : ''
  const initials = profile
    ? `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
    : '?'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7">
      {profile && (
        <Link
          to="/settings/profile"
          aria-label={`Your profile: ${name}`}
          className="group/me flex items-center gap-4 rounded-[var(--radius-tile)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-accent-indigo)_24%,transparent),var(--color-surface-lowest)_65%)] p-5 hairline-strong transition-transform duration-500 ease-[var(--ease-glide)] hover:-translate-y-0.5"
        >
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,var(--color-accent-indigo),var(--color-accent-blue))] text-headline-md font-semibold text-on-primary"
          >
            {initials || '?'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-headline-md text-on-surface">
              {profile.first_name ? `Hi, ${profile.first_name}` : 'Your profile'}
            </span>
            <span className="block truncate text-body-sm text-on-surface-variant">{profile.email}</span>
          </span>
          <ChevronRightIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="shrink-0 text-on-surface-faint transition-transform duration-300 group-hover/me:translate-x-0.5"
          />
        </Link>
      )}

      {groups.map((group) => (
        <section key={group.heading} aria-labelledby={`settings-group-${slug(group.heading)}`}>
          <h2 id={`settings-group-${slug(group.heading)}`} className="px-2">
            <Eyebrow>{group.heading}</Eyebrow>
          </h2>
          <Tile padded={false} className="mt-2 overflow-hidden">
            <ul className="divide-y divide-border-subtle">
              {group.sections.map((section) => (
                <li key={section.to}>
                  <Link
                    to={section.to}
                    className="group/row flex items-center gap-4 px-5 py-4 transition-colors duration-300 hover:bg-raised"
                  >
                    <IconBadge icon={section.icon} tone={section.tone} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-body-md font-medium ${
                          section.danger ? 'text-error' : 'text-on-surface'
                        }`}
                      >
                        {section.label}
                      </span>
                      <span className="block text-body-sm text-on-surface-variant">{section.blurb}</span>
                    </span>
                    <ChevronRightIcon
                      width={18}
                      height={18}
                      aria-hidden="true"
                      className="shrink-0 text-on-surface-faint transition-transform duration-300 group-hover/row:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Tile>
        </section>
      ))}
    </div>
  )
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z]+/g, '-')
}

/** How the app looks to you, and whether it can reach your phone. */
export function AppearanceSettingsPane() {
  return <AppearanceCard />
}

/**
 * Who can do what: the pages the church opens to each profile, and the
 * full reference of every rule — the second redrawn with the first's
 * choices, so the two can never tell different stories.
 */
export function AccessSettingsPane() {
  const [tab, setTab] = useState<'pages' | 'rules'>('pages')
  const settings = useAppSettings()
  const areas = withPageAccess(settings.page_access as PageAccess, settings.issues_raise_scope)
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Access" className="flex gap-1 self-start rounded-full bg-inset p-1 hairline">
        {(
          [
            ['pages', 'Pages'],
            ['rules', 'Every rule'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`tap rounded-full px-4 py-2 text-label-md transition-colors duration-300 ${
              tab === value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'pages' ? <PageAccessCard /> : <PermissionsCard areas={areas} />}
    </div>
  )
}

/** How long each page keeps things. */
export function RetentionSettingsPane() {
  return <RetentionCard />
}

/** What the pages show, and what starts open. */
export function DisplaySettingsPane() {
  return <DisplayCard />
}

/** The loudest thing the app can do, and who it is aimed at. */
export function SendAlertPane() {
  return <SendAlertCard />
}

/** The church's clocks: when things open, close and clear. */
export function TimingsSettingsPane() {
  return <AppSettingsCard />
}

/** The rota's tags and the Coordinator's colour. */
export function RotaSettingsPane() {
  return <RotaLookCard />
}

/** What the Tithes & offerings page offers. */
export function GivingSettingsPane() {
  return <GivingSettingsCard />
}

/** The More menu's arrangement, for everybody. */
export function MenuSettingsPane() {
  return <NavLayoutCard />
}

/** The church's own mark. Owner only, and the database agrees. */
export function AppLogoPane() {
  return <AppLogoCard />
}

/** The one that empties the diary. Owner only, and it says so itself. */
export function EraseDataPane() {
  return <AdminResetCard />
}

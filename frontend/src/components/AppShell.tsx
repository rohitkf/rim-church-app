import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  BarChartIcon,
  BellIcon,
  CalendarIcon,
  ChecklistIcon,
  GridIcon,
  HelpCircleIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TimerIcon,
  UserCircleIcon,
  UsersIcon,
} from './icons'
import type { ComponentType, SVGProps } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  enabled: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: GridIcon, enabled: true },
  { to: '/service-planner', label: 'Service Planner', icon: CalendarIcon, enabled: false },
  { to: '/checklists', label: 'Checklists', icon: ChecklistIcon, enabled: true },
  { to: '/departments', label: 'Teams', icon: UsersIcon, enabled: true },
  { to: '/analytics', label: 'Analytics', icon: BarChartIcon, enabled: false },
]

function SoonBadge() {
  return (
    <span className="ml-auto rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
      Soon
    </span>
  )
}

function primaryRoleLabel(isAdmin: boolean, roles: { role_type: string }[]) {
  if (isAdmin) return 'Admin'
  if (roles.some((r) => r.role_type === 'department_head')) return 'Department Head'
  if (roles.some((r) => r.role_type === 'assisting_head')) return 'Assisting Head'
  if (roles.some((r) => r.role_type === 'service_flow_coordinator')) return 'Service Coordinator'
  return 'Team Member'
}

export function AppShell() {
  const { profile, roles, isAdmin, signOut } = useAuth()

  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : ''

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border-subtle bg-surface-lowest px-4 py-6">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="font-mono text-label-md">SO</span>
          </div>
          <div>
            <div className="text-headline-md leading-tight">Sanctuary Ops</div>
            <div className="text-body-sm text-on-surface-variant">
              {primaryRoleLabel(isAdmin, roles)}
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            if (!item.enabled) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-body-md text-on-surface-variant/60"
                >
                  <Icon className="shrink-0" />
                  {item.label}
                  <SoonBadge />
                </div>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-body-md transition-colors',
                    isActive
                      ? 'border-primary bg-surface-container font-medium text-on-surface'
                      : 'border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
                  ].join(' ')
                }
              >
                <Icon className="shrink-0" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <button
            disabled
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary opacity-60"
            title="AI assistant lands in Phase 9"
          >
            <SparklesIcon />
            AI Assistant
            <SoonBadge />
          </button>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2 text-body-md',
                isActive
                  ? 'bg-surface-container font-medium text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
              ].join(' ')
            }
          >
            <SettingsIcon className="shrink-0" />
            Settings
          </NavLink>
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-body-md text-on-surface-variant/60">
            <HelpCircleIcon className="shrink-0" />
            Support
            <SoonBadge />
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface-lowest px-8 py-4">
          <label className="flex w-full max-w-sm items-center gap-2 rounded-sm border border-border-subtle bg-surface-muted px-3 py-2 text-body-sm text-on-surface-variant">
            <SearchIcon width={16} height={16} />
            <input
              disabled
              placeholder="Search…"
              className="w-full bg-transparent outline-none placeholder:text-on-surface-variant"
            />
          </label>
          <div className="flex items-center gap-4 text-on-surface-variant">
            <TimerIcon />
            <BellIcon />
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container font-mono text-label-sm text-on-surface hover:bg-surface-high"
            >
              {initials || <UserCircleIcon width={18} height={18} />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

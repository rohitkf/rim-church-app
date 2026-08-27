import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  BarChartIcon,
  BoxIcon,
  CalendarIcon,
  ChecklistIcon,
  ClipboardUserIcon,
  GridIcon,
  CakeIcon,
  IdCardIcon,
  HelpCircleIcon,
  MessageIcon,
  SearchIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon,
} from './icons'
import { NotificationsBell } from './NotificationsBell'
import { AccountMenu } from './AccountMenu'
import { AiAssistantPanel } from './AiAssistantPanel'
import type { ComponentType, SVGProps } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  enabled: boolean
  /** Hidden entirely from anyone who isn't an Admin. */
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: GridIcon, enabled: true },
  { to: '/service-planner', label: 'Service Planner', icon: CalendarIcon, enabled: true },
  { to: '/checklists', label: 'Checklists', icon: ChecklistIcon, enabled: true },
  { to: '/availability', label: 'Availability Tracker', icon: UserCheckIcon, enabled: true },
  { to: '/rota', label: 'Team Rota', icon: ClipboardUserIcon, enabled: true },
  { to: '/departments', label: 'Teams', icon: UsersIcon, enabled: true },
  { to: '/volunteers', label: 'Volunteers', icon: IdCardIcon, enabled: true, adminOnly: true },
  { to: '/celebrations', label: 'Celebrations', icon: CakeIcon, enabled: true },
  { to: '/inventory', label: 'Inventory', icon: BoxIcon, enabled: true },
  { to: '/messages', label: 'Messages', icon: MessageIcon, enabled: true },
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
  return 'Team Member'
}

// The AI assistant needs the FastAPI backend deployed (Anthropic key +
// Whisper live somewhere) — until that's stood up, this flag keeps the
// button visible but inert instead of shipping a button that always
// errors. Flip VITE_AI_ASSISTANT_ENABLED=true once the backend is live;
// no other code changes needed.
const AI_ASSISTANT_ENABLED = import.meta.env.VITE_AI_ASSISTANT_ENABLED === 'true'

export function AppShell() {
  const { profile, roles, isAdmin, signOut } = useAuth()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : ''

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border-subtle bg-surface-lowest px-4 py-6">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="font-mono text-label-md">RIM</span>
          </div>
          <div>
            <div className="text-headline-md leading-tight">Rehoboth International Ministries</div>
            <div className="text-body-sm text-on-surface-variant">
              {primaryRoleLabel(isAdmin, roles)}
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null
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
          {AI_ASSISTANT_ENABLED ? (
            <button
              onClick={() => setAssistantOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90"
            >
              <SparklesIcon />
              AI Assistant
            </button>
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary opacity-60"
              title="The AI assistant is built but not deployed yet"
            >
              <SparklesIcon />
              AI Assistant
              <SoonBadge />
            </div>
          )}
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
          <div className="flex items-center gap-2 text-on-surface-variant">
            <NotificationsBell />
            <AccountMenu initials={initials} onSignOut={() => setConfirmSignOut(true)} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>

      {confirmSignOut && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-out-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
            <h2 id="sign-out-title" className="text-headline-md">
              Sign out?
            </h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              You'll need your email and password to get back in.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmSignOut(false)}
                className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Stay signed in
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90"
              >
                Yes, sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {AI_ASSISTANT_ENABLED && (
        <AiAssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      )}
    </div>
  )
}

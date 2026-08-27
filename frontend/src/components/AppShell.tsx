import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  BarChartIcon,
  BoxIcon,
  CalendarIcon,
  ChecklistIcon,
  ClipboardUserIcon,
  GridIcon,
  MenuIcon,
  IdCardIcon,
  HelpCircleIcon,
  MessageIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon,
} from './icons'
import { NotificationsBell } from './NotificationsBell'
import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'
import { GlobalSearch } from './GlobalSearch'
import { AiAssistantPanel } from './AiAssistantPanel'
import { PwaBanners } from './PwaBanners'
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
  // Below lg the sidebar is a drawer over the page rather than a column
  // beside it — 280px of permanent navigation leaves nothing of a phone.
  // Following a link is the end of navigating, so every link in the drawer
  // closes it rather than leaving it over the page you just asked for.
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = () => setNavOpen(false)

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    // The page behind a drawer must not scroll with it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [navOpen])

  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : ''

  return (
    <div className="flex min-h-[100svh] bg-background text-on-background">
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        id="app-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-surface-lowest pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-4 pt-[calc(1.5rem+env(safe-area-inset-top))] transition-transform duration-300 ease-[var(--ease-glide)] lg:static lg:translate-x-0 lg:bg-surface-lowest/80 lg:pb-6 lg:pt-6 lg:backdrop-blur-xl dark:border-white/8 ${
          navOpen ? 'translate-x-0 shadow-[var(--shadow-lifted)]' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-[var(--shadow-ambient)] ring-1 ring-inset ring-white/15">
            <span className="font-mono text-label-md">RIM</span>
          </div>
          <div>
            <div className="text-headline-md leading-tight">Rehoboth International Ministries</div>
            <div className="text-body-sm text-on-surface-variant">
              {primaryRoleLabel(isAdmin, roles)}
            </div>
          </div>
        </div>

        {isAdmin && (
          <NavLink
            to="/service-planner?new=1"
            onClick={closeNav}
            className="group/cta mb-6 flex items-center justify-between gap-2 rounded-full bg-primary py-2.5 pl-5 pr-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] ring-1 ring-inset ring-white/15 transition-all duration-500 ease-[var(--ease-glide)] hover:shadow-[var(--shadow-lifted)] active:scale-[0.98]"
          >
            New service
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-body-md leading-none transition-transform duration-500 ease-[var(--ease-glide)] group-hover/cta:rotate-90"
            >
              +
            </span>
          </NavLink>
        )}

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
                onClick={closeNav}
                className={({ isActive }) =>
                  [
                    'group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-md transition-all duration-500 ease-[var(--ease-glide)]',
                    isActive
                      ? 'bg-surface-container font-medium text-on-surface ring-1 ring-inset ring-black/5 dark:ring-white/10'
                      : 'text-on-surface-variant hover:bg-surface-low hover:text-on-surface',
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
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-surface-lowest/75 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl lg:justify-between lg:px-8 lg:pb-4 lg:pt-4 dark:border-white/8">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="app-navigation"
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface lg:hidden"
          >
            <MenuIcon />
          </button>
          <GlobalSearch />
          <div className="flex shrink-0 items-center gap-1 text-on-surface-variant sm:gap-2">
            <ThemeToggle />
            <NotificationsBell />
            <AccountMenu initials={initials} onSignOut={() => setConfirmSignOut(true)} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-10">
          <Outlet />
        </main>
      </div>

      <PwaBanners />

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

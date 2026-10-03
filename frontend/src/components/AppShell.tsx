import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SparklesIcon } from './icons'
import { NotificationsBell } from './NotificationsBell'
import { AccountMenu } from './AccountMenu'
import { InstallAppBadge } from './InstallApp'
import { AppMark } from './AppMark'
import { useNotificationRouting } from '../lib/useNotificationRouting'
import { useScrolled } from '../lib/useScrolled'
import { GlobalSearch } from './GlobalSearch'
import { ComingSoonDialog } from './ComingSoonDialog'
import { AiAssistantPanel } from './AiAssistantPanel'
import { PwaBanners } from './PwaBanners'
import { useLiveData } from '../lib/useLiveData'
import { AlertBanner } from './AlertBanner'
import { DockNav } from './DockNav'
import { NAV_ITEMS as navItems } from '../lib/navItems'
import { usePageAccess } from '../lib/usePageAccess'
import { NAV_LAYOUT_KEY, applyNavLayout, fetchNavLayout } from '../lib/navLayout'
import { useQuery } from '@tanstack/react-query'
import { ActionButton } from './Surface'
import { WelcomeTour } from './WelcomeTour'
import { ViewAsBanner } from './ViewAsBanner'


/**
 * Which colour the page's ambient wash is lit with.
 *
 * Each section keeps one hue so you know where you are before you read
 * anything — Checklists green-lit, Teams indigo, Inventory amber. It is
 * light behind the tiles, never colour on them.
 */
const WASH: Record<string, string> = {
  '/': 'var(--color-accent-blue)',
  '/service-planner': 'var(--color-accent-blue)',
  '/checklists': 'var(--color-accent-green)',
  '/availability': 'var(--color-accent-green)',
  '/rota': 'var(--color-accent-blue)',
  // Set Lists belongs to the same Sunday as the rota it reads its leaders
  // from, so it is lit the same.
  '/set-lists': 'var(--color-accent-blue)',
  '/giving': 'var(--color-accent-green)',
  '/departments': 'var(--color-accent-indigo)',
  '/volunteers': 'var(--color-accent-indigo)',
  '/inventory': 'var(--color-accent-orange)',
  '/messages': 'var(--color-accent-indigo)',
  '/team-chat': 'var(--color-accent-indigo)',
  '/updates': 'var(--color-accent-blue)',
  '/polls': 'var(--color-accent-indigo)',
  '/issues': 'var(--color-accent-orange)',
  '/settings': 'var(--color-accent-indigo)',
}

function washFor(pathname: string) {
  const match = Object.keys(WASH)
    .filter((key) => key !== '/' && pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0]
  return WASH[match ?? '/']
}

const AI_ASSISTANT_ENABLED = import.meta.env.VITE_AI_ASSISTANT_ENABLED === 'true'

export function AppShell() {
  const { profile, signOut } = useAuth()
  // Everything the app reads goes stale when the database says so, rather
  // than when somebody thinks to refresh. Signed-in only, which is where
  // the shell lives and the only place any of it is readable.
  useLiveData()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [comingSoon, setComingSoon] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const location = useLocation()
  useNotificationRouting()
  const scrolled = useScrolled()

  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : ''

  // The church's own arrangement of the menu, when an Admin has saved one.
  const layoutQuery = useQuery({ queryKey: NAV_LAYOUT_KEY, queryFn: fetchNavLayout })
  // Only what this person may open, under the church's choices (Settings
  // › Access & privileges) — the same answer PageGate gives at the door.
  const { canOpen } = usePageAccess()
  const items = applyNavLayout(navItems, layoutQuery.data ?? null).filter((item) => canOpen(item.to))

  return (
    <div
      className="flex min-h-[100svh] flex-col bg-background text-on-background"
      style={{ '--wash-hue': washFor(location.pathname) } as React.CSSProperties}
    >
      {/*
        The top strip carries only what is true on every page: what you are
        looking for, what wants you, and who you are. Everything that is a
        destination lives in the dock instead.

        At the top of a page it needs no background — it is sitting on the
        ground. Once content is passing underneath it, the two collide
        unless the strip stands on something, so it takes a translucent one
        with the page blurred behind it and a hairline along its bottom
        edge. It appears rather than being there all along, because the
        cleaner strip is the one worth having whenever it can be had.
      */}
      <ViewAsBanner />
      <header
        className={`sticky top-0 z-20 flex items-center gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-[var(--ease-glide)] sm:px-6 lg:px-10 lg:pb-5 lg:pt-5 ${
          scrolled
            ? 'bg-[color-mix(in_oklab,var(--color-background)_72%,transparent)] shadow-[inset_0_-1px_0_0_var(--color-border-subtle)] backdrop-blur-xl backdrop-saturate-150'
            : ''
        }`}
      >
        {/*
          The app has to say what it is. The dock carries destinations and
          the page carries a greeting, so without this nothing on a signed-in
          screen names the church — which is how the sidebar's removal left
          the product anonymous. The name folds away on a phone, where the
          mark alone is enough.
        */}
        <Link
          to="/"
          className="tap flex shrink-0 items-center gap-2.5 rounded-full transition-opacity duration-300 ease-[var(--ease-glide)] hover:opacity-80"
        >
          <AppMark />
          <span className="hidden max-w-[13rem] text-label-md leading-tight text-on-surface-variant xl:block">
            Rehoboth International Ministries
          </span>
        </Link>

        <GlobalSearch />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <InstallAppBadge />
          {/* Appearance and team colours are in the account menu, under
              their own headings. They were here as well, which is two
              homes for one switch and a header carrying controls most
              people set once and never touch. */}
          <NotificationsBell />
          <AccountMenu initials={initials} onSignOut={() => setConfirmSignOut(true)} />
        </div>
      </header>

      {/* The dock floats over the page, so the page has to end above it. */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:px-10 lg:pt-4">
        <Outlet />
      </main>

      <DockNav
        items={items}
        trailing={
          AI_ASSISTANT_ENABLED ? (
            <button
              type="button"
              onClick={() => setAssistantOpen((o) => !o)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--color-accent-indigo)_22%,transparent)] px-4 text-label-md text-accent-indigo-soft transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
            >
              <SparklesIcon width={17} height={17} className="shrink-0" />
              Ask
            </button>
          ) : (
            /* Not deployed here yet — but a greyed-out label reads as a
               button somebody broke. It presses, and says so. */
            <button
              type="button"
              onClick={() => setComingSoon(true)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--color-accent-indigo)_14%,transparent)] px-4 text-label-md text-accent-indigo-soft transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
            >
              <SparklesIcon width={17} height={17} className="shrink-0" />
              Ask
            </button>
          )
        }
      />

      {/* First time in: who you are, what this is for, and the one thing
          to do about it. Shown once ever, and the once is on the profile
          rather than in this browser — see WelcomeTour. */}
      <WelcomeTour />

      <PwaBanners />

      {/* An alert interrupts wherever you are — it is worth nothing if it
          waits on the message board for someone to go and look. */}
      <AlertBanner />

      {confirmSignOut && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-out-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest p-7 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)]">
            <h2 id="sign-out-title" className="text-headline-md">
              Sign out?
            </h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              You&rsquo;ll need your email and password to get back in.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <ActionButton tone="quiet" onClick={() => setConfirmSignOut(false)}>
                Stay signed in
              </ActionButton>
              <ActionButton tone="danger" onClick={() => void signOut()}>
                Yes, sign out
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {comingSoon && <ComingSoonDialog onClose={() => setComingSoon(false)} />}

      {AI_ASSISTANT_ENABLED && (
        <AiAssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      )}
    </div>
  )
}

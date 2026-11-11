import type { ComponentType, ReactNode } from 'react'
import { IconBadge } from './Surface'
import { CompassIcon, ReloadIcon, WarningIcon } from './icons'
import { ownBuildId } from '../lib/pwa'
import { reloadApp } from '../lib/reloadApp'

/**
 * The page somebody gets when the page they asked for cannot be shown.
 *
 * One look for the three ways that happens (lib/pageErrors): the address
 * leads nowhere, the page's code would not download, the page threw
 * while it was drawn. Each says in a sentence what happened and what to
 * do, and each has the button the Owner asked for: back to the Dashboard.
 *
 * It uses nothing a broken app might not have. No router: it is also
 * what the outermost error boundary draws, above the router, and the way
 * back is a plain link — a full load of the Dashboard, which is the
 * surest way out of a page whose state has gone wrong. No session, no
 * query, no setting: whatever broke may be what would have supplied them.
 */

type Tone = 'blue' | 'orange'

function Screen({
  icon,
  tone,
  eyebrow,
  title,
  children,
  actions,
}: {
  icon: ComponentType<{ className?: string; width?: number; height?: number }>
  tone: Tone
  eyebrow: string
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <main className="flex min-h-[100svh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-7 text-center hairline sm:p-9">
        <IconBadge icon={icon} tone={tone} size="lg" className="mx-auto" />
        <p className="mt-5 font-mono text-eyebrow uppercase text-on-surface-faint">{eyebrow}</p>
        <h1 className="mt-2 text-balance text-headline-md text-on-surface">{title}</h1>
        {children}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      </div>
    </main>
  )
}

const primary =
  'tap inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms]'
const secondary =
  'tap inline-flex items-center justify-center rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface'

/** The way out: a full load of the Dashboard, not a move inside an app that may be broken. */
function ToDashboard({ first = true }: { first?: boolean }) {
  return (
    <a href="/" className={first ? primary : secondary}>
      Back to the Dashboard
    </a>
  )
}

function Reload({ first = false, children }: { first?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={reloadApp} className={first ? primary : secondary}>
      {children}
    </button>
  )
}

/** Where somebody was when it happened, wrapped rather than cut: a mistyped address is read letter by letter. */
function Address({ path }: { path: string }) {
  return (
    <p className="mt-4 rounded-[var(--radius-row)] bg-raised px-4 py-2.5 font-mono text-label-md text-on-surface [overflow-wrap:anywhere]">
      {path}
    </p>
  )
}

/** The address leads nowhere. */
export function NotFoundScreen({ path, onBack }: { path?: string; onBack?: () => void }) {
  return (
    <Screen
      icon={CompassIcon}
      tone="blue"
      eyebrow="Error 404"
      title="Page not found"
      actions={
        <>
          <ToDashboard />
          {onBack && (
            <button type="button" onClick={onBack} className={secondary}>
              Go back
            </button>
          )}
        </>
      }
    >
      <p className="mt-3 text-body-md text-on-surface-variant">
        There&rsquo;s nothing at this address. It may have been mistyped, or the page has moved or been removed.
      </p>
      {path && <Address path={path} />}
    </Screen>
  )
}

/** The page's code would not download: an update since this tab was opened, or the connection. */
export function StalePageScreen({ onDashboard }: { onDashboard: boolean }) {
  return (
    <Screen
      icon={ReloadIcon}
      tone="blue"
      eyebrow="Couldn’t load"
      title="This page couldn’t be loaded"
      actions={
        <>
          <Reload first>Reload the app</Reload>
          {!onDashboard && <ToDashboard first={false} />}
        </>
      }
    >
      <p className="mt-3 text-body-md text-on-surface-variant">
        The app has been updated since this tab was opened, or the connection dropped while the page was loading.
        Reloading brings in the current version.
      </p>
      <p className="mt-3 text-label-md text-on-surface-faint">Nothing you have saved is affected.</p>
    </Screen>
  )
}

/**
 * The page threw while it was being drawn.
 *
 * `summary` is the error in a line (lib/pageErrors), folded away: nobody
 * needs it to get out, and whoever is told "it broke" needs exactly it.
 * The address and the build go with it, because "which page, on which
 * version" is the first thing asked.
 */
export function BrokenPageScreen({ path, summary }: { path: string; summary: string }) {
  const onDashboard = path === '/'
  const build = ownBuildId()
  return (
    <Screen
      icon={WarningIcon}
      tone="orange"
      eyebrow="Something went wrong"
      title="This page ran into a problem"
      actions={
        onDashboard ? (
          <Reload first>Reload the app</Reload>
        ) : (
          <>
            <ToDashboard />
            <Reload>Try again</Reload>
          </>
        )
      }
    >
      <p className="mt-3 text-body-md text-on-surface-variant">
        It couldn&rsquo;t be shown, and it isn&rsquo;t something you did.{' '}
        {onDashboard
          ? 'Reloading usually clears it.'
          : 'Going back to the Dashboard usually clears it.'}{' '}
        If it keeps happening, please tell an Admin which page it was.
      </p>
      <details className="mt-4 rounded-[var(--radius-row)] bg-raised px-4 py-2.5 text-left">
        <summary className="cursor-pointer text-label-md font-medium text-on-surface-variant">Technical details</summary>
        <p className="mt-2 font-mono text-label-md text-on-surface [overflow-wrap:anywhere]">{summary}</p>
        <p className="mt-1 font-mono text-label-md text-on-surface-faint [overflow-wrap:anywhere]">
          {path}
          {build ? ` · build ${build}` : ''}
        </p>
      </details>
    </Screen>
  )
}

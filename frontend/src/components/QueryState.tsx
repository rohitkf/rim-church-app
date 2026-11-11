import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QueryClientContext } from '@tanstack/react-query'
import { useErrorText } from '../lib/useErrorText'
import { isNoSuchRow } from '../lib/pageErrors'
import { reloadApp } from '../lib/reloadApp'
import { IconBadge } from './Surface'
import { CompassIcon } from './icons'

/** What a page says when the one thing it is about is not there. */
export interface Missing {
  /** "Team not found" */
  title: string
  /** One sentence more, where the usual one does not fit. */
  body?: string
  /** The list this thing would have been on: the nearest sensible place. */
  back?: { to: string; label: string }
}

interface QueryStateProps {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  emptyMessage?: string
  /**
   * For a page about one thing (a team, a service, an event): when that
   * thing is not there, `isEmpty` shows this in place of a line of text —
   * what is missing, and the way to the list it belongs to and to the
   * Dashboard.
   */
  missing?: Missing
  children: ReactNode
}

/**
 * Consistent loading/error/empty wrapper for a Supabase-backed query, so
 * every list/detail page renders the same three states the same way
 * instead of each screen inventing its own ad-hoc spinner/error text.
 *
 * A read that fails says so and offers the two things that help: trying
 * again, and the Dashboard. Until November 2026 it was a red line with
 * nothing to press, which left somebody on a page that had not loaded
 * with no way forward but the menu.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'Nothing here yet.',
  missing,
  children,
}: QueryStateProps) {
  const errorText = useErrorText()
  if (isLoading) {
    return <p className="text-body-sm text-on-surface-variant">Loading…</p>
  }

  if (error) {
    // A page about one thing, asked for by an id the database cannot even
    // read as one (a link cut short) or has no row for: that is "not
    // there", not a failure to try again.
    if (missing && isNoSuchRow(error)) return <MissingPanel missing={missing} />
    return <Failed message={errorText(error, 'Something went wrong loading this.')} />
  }

  if (isEmpty) {
    if (missing) return <MissingPanel missing={missing} />
    return <p className="text-body-sm text-on-surface-variant">{emptyMessage}</p>
  }

  return <>{children}</>
}

const strip = 'font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current disabled:opacity-60'

/**
 * A read that failed: what went wrong, and what to do about it.
 *
 * "Try again" asks again for everything on the page that failed, not only
 * this panel: when the cause is the connection or the server, every panel
 * failed together and one press should bring them all back. With no query
 * client to ask (a component drawn on its own), it reloads the page.
 *
 * The Dashboard is a plain link, a full load: the surest way out of a
 * page that is not working, and not offered on the Dashboard itself.
 */
function Failed({ message }: { message: string }) {
  const client = useContext(QueryClientContext)
  const [retrying, setRetrying] = useState(false)
  const onDashboard = typeof window !== 'undefined' && window.location.pathname === '/'

  const retry = () => {
    if (!client) return reloadApp()
    setRetrying(true)
    void client
      .refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' })
      .finally(() => setRetrying(false))
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
      <p className="min-w-0 flex-1 basis-56 [overflow-wrap:anywhere]">{message}</p>
      <span className="flex shrink-0 items-center gap-4">
        <button type="button" onClick={retry} disabled={retrying} className={strip}>
          {retrying ? 'Trying…' : 'Try again'}
        </button>
        {!onDashboard && (
          <a href="/" className={strip}>
            Dashboard
          </a>
        )}
      </span>
    </div>
  )
}

/**
 * The page is here; what it was asked to show is not.
 *
 * Inside the app's frame, unlike a 404: the menus still work, and the
 * nearest useful place is usually the list this thing would have been on.
 * It does not say which of "never existed", "was deleted" and "is not
 * open to you" it is, because the database does not tell them apart for
 * somebody who may not see the row.
 */
function MissingPanel({ missing }: { missing: Missing }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-7 text-center hairline sm:p-9">
      <IconBadge icon={CompassIcon} tone="blue" size="lg" className="mx-auto" />
      <h1 className="mt-5 text-balance text-headline-md text-on-surface">{missing.title}</h1>
      <p className="mt-3 text-body-md text-on-surface-variant">
        {missing.body ?? 'It may have been removed, the link may be wrong, or it may not be open to you.'}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {missing.back && (
          <Link
            to={missing.back.to}
            className="tap inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms]"
          >
            {missing.back.label}
          </Link>
        )}
        <Link
          to="/"
          className={
            missing.back
              ? 'tap inline-flex items-center justify-center rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface'
              : 'tap inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary'
          }
        >
          Back to the Dashboard
        </Link>
      </div>
    </div>
  )
}

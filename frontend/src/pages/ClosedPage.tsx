import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { IconBadge } from '../components/Surface'
import { SettingsIcon } from '../components/icons'
import { momentWords } from '../lib/appNotices'
import type { Standing } from '../lib/standing'

/**
 * The app is closed for maintenance.
 *
 * Shown in place of the whole app to somebody the database is turning
 * away while a closure runs (0278, lib/standing). It is the only thing
 * they can reach, so it has to answer the two questions a closed door
 * raises: why, and until when. The words are whatever the notice said;
 * the time is the closure's own.
 *
 * Nothing here can be pressed to get in. "Try again" asks the database
 * the same question again, which is also what this page does by itself
 * every minute, and signing out is offered because a shared phone should
 * not be stuck on somebody's closed door.
 */
export function ClosedPage({
  closed,
  checking,
  onRetry,
}: {
  closed: NonNullable<Standing['closed']>
  checking: boolean
  onRetry: () => void
}) {
  const { signOut } = useAuth()
  const [leaving, setLeaving] = useState(false)

  return (
    <main className="flex min-h-[100svh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-7 text-center hairline sm:p-9">
        <IconBadge icon={SettingsIcon} tone="orange" size="lg" className="mx-auto" />
        <p className="mt-5 font-mono text-eyebrow uppercase text-on-surface-faint">Closed for maintenance</p>
        <h1 className="mt-2 break-words text-headline-md text-on-surface">{closed.title}</h1>
        {closed.body && (
          <p className="mt-3 whitespace-pre-line break-words text-body-md text-on-surface-variant">{closed.body}</p>
        )}
        <p className="mt-5 rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface">
          The app opens again on <strong className="font-semibold">{momentWords(closed.until)}</strong>.
        </p>
        <p className="mt-3 text-label-md text-on-surface-faint">
          Nothing of yours is lost. This page looks again by itself every minute and opens the app as soon as it can.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={checking}
            onClick={onRetry}
            className="tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Try again'}
          </button>
          <button
            type="button"
            disabled={leaving}
            onClick={() => {
              setLeaving(true)
              void signOut().finally(() => setLeaving(false))
            }}
            className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-60"
          >
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </main>
  )
}

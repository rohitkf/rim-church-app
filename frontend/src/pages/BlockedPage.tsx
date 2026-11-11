import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { IconBadge } from '../components/Surface'
import { LockIcon } from '../components/icons'
import { momentWords } from '../lib/appNotices'
import type { Standing } from '../lib/standing'

/**
 * This account has been blocked by an administrator.
 *
 * Shown in place of the whole app to somebody whose account is blocked
 * (0279, lib/standing): they can still sign in, and this is what they
 * meet. The database is turning away every request they make, so nothing
 * behind this page would load anyway; the page exists so that what they
 * see is a sentence and not a screen of errors.
 *
 * It says what has happened and who to speak to, and nothing about why:
 * the reason is a note between the people who may block, and the
 * conversation with an Admin is where it belongs. Which account it is
 * about is said, because on a shared phone "blocked" with no name is a
 * puzzle.
 *
 * Nothing here can be pressed to get in. "Try again" asks the database
 * the same question again, which this page also does by itself every
 * minute, so it opens the app the moment the block is taken back.
 */
export function BlockedPage({
  blocked,
  email,
  checking,
  onRetry,
}: {
  blocked: NonNullable<Standing['blocked']>
  email: string | null
  checking: boolean
  onRetry: () => void
}) {
  const { signOut } = useAuth()
  const [leaving, setLeaving] = useState(false)

  return (
    <main className="flex min-h-[100svh] items-center justify-center px-4 py-10">
      <div
        role="alertdialog"
        aria-labelledby="blocked-title"
        aria-describedby="blocked-what-to-do"
        className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-7 text-center hairline sm:p-9"
      >
        <IconBadge icon={LockIcon} tone="red" size="lg" className="mx-auto" />
        <p className="mt-5 font-mono text-eyebrow uppercase text-on-surface-faint">Account blocked</p>
        <h1 id="blocked-title" className="mt-2 text-balance text-headline-md text-on-surface">
          Your account has been blocked by an administrator
        </h1>
        <p id="blocked-what-to-do" className="mt-3 text-body-md text-on-surface-variant">
          You can&rsquo;t use the app while the block is in place. Please contact a church Admin to resolve this.
        </p>
        <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-[var(--radius-row)] bg-raised px-4 py-3 text-left text-body-sm">
          {email && (
            <>
              <dt className="text-on-surface-faint">Signed in as</dt>
              <dd className="text-right font-medium text-on-surface [overflow-wrap:anywhere]">{email}</dd>
            </>
          )}
          <dt className="text-on-surface-faint">Blocked on</dt>
          <dd className="text-right font-medium text-on-surface">{momentWords(blocked.at)}</dd>
        </dl>
        <p className="mt-3 text-label-md text-on-surface-faint">
          Nothing of yours has been removed. This page checks again by itself every minute and opens the app as soon
          as the block is lifted.
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

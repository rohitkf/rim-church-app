import { IconBadge } from '../components/Surface'
import { ReloadIcon } from '../components/icons'

/**
 * The app is being updated.
 *
 * Shown in place of the whole app while the database has not yet reached
 * the migration this build needs (lib/databaseVersion, 0285) — the
 * minutes in which, until now, pages failed in the database's own words
 * ("Could not find the function … in the schema cache").
 *
 * It asks again by itself every fifteen seconds and gives the app back
 * the moment the answer changes; nobody has to reload. "Open the app
 * anyway" appears once somebody has waited a while: this page is a
 * courtesy, not a lock, and if the number were ever wrong a church must
 * not be kept out of its own app on a Sunday by it. Most of the app works
 * either way; only what is new would fail.
 */
export function UpdatingPage({
  checking,
  mayOpenAnyway,
  onRetry,
  onOpenAnyway,
}: {
  checking: boolean
  mayOpenAnyway: boolean
  onRetry: () => void
  onOpenAnyway: () => void
}) {
  return (
    <main className="flex min-h-[100svh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-7 text-center hairline sm:p-9">
        <IconBadge icon={ReloadIcon} tone="blue" size="lg" className="mx-auto" />
        <p className="mt-5 font-mono text-eyebrow uppercase text-on-surface-faint">One moment</p>
        <h1 className="mt-2 text-balance text-headline-md text-on-surface">The app is being updated</h1>
        <p className="mt-3 text-body-md text-on-surface-variant">
          A new version is going out and its last part has not arrived yet. It usually takes a minute or two.
        </p>
        <p className="mt-3 text-label-md text-on-surface-faint" aria-live="polite">
          Nothing of yours is lost. This page looks again by itself every few seconds and opens the app as soon as it can.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={checking}
            onClick={onRetry}
            className="tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Try now'}
          </button>
          {mayOpenAnyway && (
            <button
              type="button"
              onClick={onOpenAnyway}
              className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface"
            >
              Open the app anyway
            </button>
          )}
        </div>
        {mayOpenAnyway && (
          <p className="mt-3 text-label-md text-on-surface-faint">
            Still waiting? You can carry on: most of the app works, and anything new may not until the update finishes.
          </p>
        )}
      </div>
    </main>
  )
}

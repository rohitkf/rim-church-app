import { Overlay } from './Surface'
import { MegaphoneIcon } from './icons'
import { DETAILS_SHOWN, type Release } from '../lib/releases'

/**
 * What is new, for whoever asked: every release they have not been told
 * about, newest first, in one sheet they opened themselves and can close.
 *
 * It used to open by itself, one card a release, over whatever somebody
 * was doing. Now it is behind "Show details" on the notice at the top of
 * the screen (UpdateNotice before a reload, WhatsNew after one).
 *
 * `onGo` is the way to a release's page. Left out — before a reload, when
 * the page may not exist in the build that is still running — the
 * releases are words only.
 */
export function ReleaseDetails({
  releases,
  onClose,
  onGo,
}: {
  releases: Release[]
  onClose: () => void
  onGo?: (to: string) => void
}) {
  const shown = releases.slice(0, DETAILS_SHOWN)
  const earlier = releases.length - shown.length
  const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  return (
    <Overlay onDismiss={onClose} label="What’s new">
      <div className="w-full max-w-[480px] rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:p-8 dark:ring-white/12">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] text-accent-blue-soft"
          >
            <MegaphoneIcon width={20} height={20} />
          </span>
          <h2 className="text-headline-md">What’s new</h2>
        </div>

        {shown.length === 0 ? (
          <p className="mt-5 text-body-md text-on-surface-variant">
            Fixes and small improvements. Nothing you need to learn.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-6">
            {shown.map((release) => (
              <li key={release.key}>
                <p className="font-mono text-label-sm text-on-surface-faint">{day(release.date)}</p>
                <h3 className="mt-1 text-headline-sm">{release.title}</h3>
                <p className="mt-1 text-body-sm text-on-surface-variant">{release.lead}</p>
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {release.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-body-sm text-on-surface">
                      <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                {onGo && release.link && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onGo(release.link!.to)
                    }}
                    className="tap mt-3 rounded-full bg-raised-strong px-4 py-2 text-body-sm font-medium text-on-surface hairline"
                  >
                    {release.link.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {earlier > 0 && (
          <p className="mt-5 text-label-md text-on-surface-faint">
            And {earlier} earlier {earlier === 1 ? 'change' : 'changes'}.
          </p>
        )}

        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-7 w-full rounded-full bg-primary px-5 py-3 text-body-md font-semibold text-on-primary hover:opacity-90"
        >
          Done
        </button>
      </div>
    </Overlay>
  )
}

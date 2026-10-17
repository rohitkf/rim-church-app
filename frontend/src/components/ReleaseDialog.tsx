import { useNavigate } from 'react-router-dom'
import { Overlay } from './Surface'
import { SparklesIcon } from './icons'
import type { Release } from '../lib/releases'

/**
 * One card about one release: what it is, what it does, a way to go and
 * see it. Reusable for anything that wants announcing — it knows nothing
 * about when it opens; WhatsNew decides that.
 */
export function ReleaseDialog({ release, onClose }: { release: Release; onClose: () => void }) {
  const navigate = useNavigate()
  const when = new Date(`${release.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  return (
    <Overlay onDismiss={onClose} label={`New: ${release.title}`}>
      <div className="w-full max-w-[440px] rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:p-8 dark:ring-white/12">
        <div className="flex items-center justify-between gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] text-accent-blue-soft"
          >
            <SparklesIcon width={22} height={22} />
          </span>
          <span className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-faint">New · {when}</span>
        </div>
        <h2 className="mt-5 text-headline-md">{release.title}</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">{release.lead}</p>
        <ul className="mt-4 flex flex-col gap-2">
          {release.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-body-sm text-on-surface">
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3">
          {release.link && (
            <button
              type="button"
              autoFocus
              onClick={() => {
                onClose()
                navigate(release.link!.to)
              }}
              className="rounded-full bg-primary px-5 py-3 text-body-md font-medium text-on-primary hover:opacity-90"
            >
              {release.link.label}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="tap text-center text-label-md text-on-surface-faint hover:text-on-surface"
          >
            {release.link ? 'Later' : 'Got it'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

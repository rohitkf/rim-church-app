import { useState } from 'react'
import { applyUpdate } from '../lib/pwa'
import { usePwa } from '../lib/usePwa'
import { Overlay } from './Surface'

/**
 * A new version is ready, and the old one stops here.
 *
 * This was a pill at the foot of the screen with a Reload button on it —
 * easy to ignore, and ignored. An app left on an old build through a
 * Sunday morning is not a cosmetic problem: the running order, the call
 * times and the checklist windows are what a deploy usually changes, and
 * two people reading different versions of the same morning is exactly
 * the confusion the app exists to prevent.
 *
 * So it is a door rather than a notice. There is no Cancel, Escape does
 * nothing, and the backdrop cannot be tapped away: the only thing on it
 * is the button that gets you the new version.
 *
 * Nothing is lost by that. The update has already downloaded — reloading
 * is a page swap, not a fetch — and anything typed but unsaved would have
 * been lost by the reload the banner was asking for anyway. What this
 * changes is only whether the reload happens now or on Thursday.
 */
export function UpdateRequiredDialog() {
  const { updateReady } = usePwa()
  const [reloading, setReloading] = useState(false)

  if (!updateReady) return null

  return (
    /* `onDismiss` deliberately does nothing: Overlay wires it to Escape and
       to a click on the backdrop, and neither is a way out of this one. */
    <Overlay onDismiss={() => {}} label="A new version is ready" closable={false}>
      <div
        role="alertdialog"
        aria-label="A new version is ready"
        className="w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-7 text-center shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <span
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-primary)_18%,transparent)] text-primary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 12a8 8 0 0 1-13.7 5.6L4 16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 4v4h-4M4 20v-4h4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h2 className="mt-4 text-headline-md">A new version is ready</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          It is already downloaded. Reload to carry on — everyone needs to be reading the same
          version of this morning.
        </p>

        <button
          type="button"
          autoFocus
          disabled={reloading}
          onClick={() => {
            setReloading(true)
            applyUpdate()
          }}
          className="mt-6 w-full rounded-full bg-primary px-5 py-3 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-70"
        >
          {reloading ? 'Reloading…' : 'Reload now'}
        </button>
      </div>
    </Overlay>
  )
}

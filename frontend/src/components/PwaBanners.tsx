import { useState } from 'react'
import { applyUpdate, isIos, promptInstall } from '../lib/pwa'
import { usePwa } from '../lib/usePwa'

/**
 * The two things an installed app has to be able to say for itself: that
 * the connection has gone, and that a new version is ready.
 *
 * Both sit at the bottom on a phone, above the home bar, where a thumb can
 * reach them and where they don't cover the header.
 */
export function PwaBanners() {
  const { offline, updateReady } = usePwa()

  if (!offline && !updateReady) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {offline && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-surface-container px-4 py-2.5 text-body-sm text-on-surface shadow-[var(--shadow-lifted)] ring-1 ring-black/8 dark:ring-white/12"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          Offline — you can read what&rsquo;s here, but changes won&rsquo;t save
        </div>
      )}

      {updateReady && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-3 rounded-full bg-surface-container py-2 pl-4 pr-2 text-body-sm text-on-surface shadow-[var(--shadow-lifted)] ring-1 ring-black/8 dark:ring-white/12"
        >
          A new version is ready
          <button
            type="button"
            onClick={applyUpdate}
            className="rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.98]"
          >
            Reload
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The install offer.
 *
 * Chromium hands over an event we can replay on a button press. Safari
 * never does — installing there is a Share-sheet gesture — so on iOS the
 * only honest thing to offer is the instruction.
 */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const { installPrompt, installed } = usePwa()
  const [showIosHint, setShowIosHint] = useState(false)
  const ios = isIos()

  if (installed) return null
  if (!installPrompt && !ios) return null

  if (ios) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setShowIosHint((v) => !v)}
          className="w-full rounded-lg px-3 py-2 text-left text-body-sm text-on-surface hover:bg-surface-container"
        >
          Add to Home Screen
        </button>
        {showIosHint && (
          <p className="px-3 pb-2 pt-1 text-label-sm text-on-surface-variant">
            Tap the Share button in Safari, then &ldquo;Add to Home Screen&rdquo;.
          </p>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={`w-full rounded-lg px-3 py-2 text-left text-body-sm text-on-surface hover:bg-surface-container ${className}`}
    >
      Install app
    </button>
  )
}

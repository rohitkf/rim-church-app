import { usePwa } from '../lib/usePwa'

/**
 * What an installed app has to be able to say for itself when the
 * connection goes.
 *
 * It sits at the bottom on a phone, above the home bar, where a thumb can
 * reach it and where it doesn't cover the header.
 *
 * A new version used to be announced here too, as a pill with a Reload
 * button, and was ignored for as long as anybody liked. That is a door
 * rather than a notice — see UpdateRequiredDialog.
 */
export function PwaBanners() {
  const { offline } = usePwa()

  if (!offline) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-surface-container px-4 py-2.5 text-body-sm text-on-surface shadow-[var(--shadow-lifted)] ring-1 ring-black/8 dark:ring-white/12"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        Offline — you can read what&rsquo;s here, but changes won&rsquo;t save
      </div>
    </div>
  )
}

import { useAuth } from '../auth/AuthContext'
import { viewAsLabel } from '../lib/viewAs'

/**
 * The strip across the top while an Admin is previewing the app as
 * somebody else.
 *
 * It says two things, and the second matters as much as the first. The
 * pages, the dock and the buttons are the ones that person would get. The
 * rows are not: the database still answers with the Admin's own access,
 * so a list may hold more than theirs would. A preview that let an Admin
 * believe "they can see this" when only the Admin can is worse than none.
 */
export function ViewAsBanner() {
  const { viewAs, setViewAs } = useAuth()
  if (!viewAs) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[color-mix(in_oklab,var(--color-accent-orange)_18%,var(--color-background))] px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--color-accent-orange)_40%,transparent)] sm:px-6 lg:px-10"
    >
      <p className="min-w-0 flex-1 text-body-sm text-on-surface">
        <span className="font-medium">Previewing as {viewAsLabel(viewAs)}.</span>{' '}
        <span className="text-on-surface-variant">
          Pages and buttons are what they would get; the data is still read with your Admin access,
          so lists can show more than theirs would.
        </span>
      </p>
      <button
        type="button"
        onClick={() => setViewAs(null)}
        className="tap shrink-0 rounded-full bg-primary px-4 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90"
      >
        Exit preview
      </button>
    </div>
  )
}

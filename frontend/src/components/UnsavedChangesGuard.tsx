import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Intercepts navigation away from a form with unsaved edits.
 *
 * Covers both exits: an in-app route change is caught by the router's
 * blocker (so we can show our own dialog), while a reload/tab-close is
 * caught by beforeunload (where only the browser's own prompt is
 * possible). Programmatic navigation the form itself performs after a
 * successful save is exempted via `allowNavigation()`.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const bypassRef = useRef(false)

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        isDirty && !bypassRef.current && currentLocation.pathname !== nextLocation.pathname,
      [isDirty],
    ),
  )

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const allowNavigation = useCallback(() => {
    bypassRef.current = true
  }, [])

  return { blocker, allowNavigation }
}

interface UnsavedChangesDialogProps {
  blocker: ReturnType<typeof useBlocker>
  message?: string
}

export function UnsavedChangesDialog({
  blocker,
  message = 'Your changes here haven’t been saved yet. Leaving now discards them.',
}: UnsavedChangesDialogProps) {
  if (blocker.state !== 'blocked') return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
        <h2 id="unsaved-changes-title" className="text-headline-md">
          Leave this page?
        </h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">{message}</p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => blocker.reset?.()}
            className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => blocker.proceed?.()}
            className="rounded-sm bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  )
}

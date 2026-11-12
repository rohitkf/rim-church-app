import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast'

/**
 * Where toasts appear: above the dock, centred, out of the way of the
 * thumb. Polite, so a screen reader says "Saved" without interrupting.
 *
 * One with something to press — "Undo" — is a button in the same pill.
 * Pressing it runs the action and takes the toast down, so it cannot be
 * pressed twice.
 */
export function Toaster() {
  const [list, setList] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setList), [])
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-2.5 text-body-sm font-medium shadow-[var(--shadow-lifted)] ${
            t.action ? 'pl-4 pr-2' : 'px-4'
          } ${t.tone === 'error' ? 'bg-error text-on-error' : 'bg-on-surface text-background'}`}
        >
          <span aria-hidden="true">{t.tone === 'error' ? '!' : '✓'}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                const { run } = t.action!
                dismissToast(t.id)
                run()
              }}
              className="tap ml-1 shrink-0 rounded-full bg-background/15 px-3 py-1 text-body-sm font-semibold underline decoration-current/50 underline-offset-2 hover:bg-background/25"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

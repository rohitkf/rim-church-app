import { useEffect, useState } from 'react'
import { subscribeToasts, type Toast } from '../lib/toast'

/**
 * Where toasts appear: above the dock, centred, out of the way of the
 * thumb. Polite, so a screen reader says "Saved" without interrupting.
 */
export function Toaster() {
  const [list, setList] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setList), [])
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-8"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-body-sm font-medium shadow-[var(--shadow-lifted)] ${
            t.tone === 'error' ? 'bg-error text-on-error' : 'bg-on-surface text-background'
          }`}
        >
          <span aria-hidden="true">{t.tone === 'error' ? '!' : '✓'}</span>
          {t.text}
        </div>
      ))}
    </div>
  )
}

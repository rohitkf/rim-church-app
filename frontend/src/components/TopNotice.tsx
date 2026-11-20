import { type ReactNode, useEffect, useRef } from 'react'

/*
 * The room a notice takes, told to the page.
 *
 * The notice floats (it must stay in sight while the page scrolls), and
 * for as long as it did only that it sat on top of whatever the page had
 * there: on a phone, the page's own title — "Rece…ion" behind "The app
 * was updated" until somebody dismissed it, after every release. So while
 * a notice is up it writes its height to `--top-notice-h`, and AppShell
 * leaves that much room above the page. Gone, the room goes with it.
 *
 * Kept per notice: two can be up at once, and one leaving must not take
 * the other's room.
 */
const heights = new Map<object, number>()
function writeRoom(): void {
  const root = document.documentElement
  const tallest = Math.max(0, ...heights.values())
  if (tallest > 0) root.style.setProperty('--top-notice-h', `${tallest}px`)
  else root.style.removeProperty('--top-notice-h')
}

/**
 * A small line at the top of the screen with a button or two on it: a new
 * version is ready, the app was updated.
 *
 * It holds nothing up. It sits under the app's top strip, above the page
 * and below every dialog (z-40; an Overlay is z-50), takes no focus, and
 * only its own pill catches a tap — the rest of the row lets them through
 * to the page. On a phone the buttons sit on a second line. And it covers
 * nothing: the page leaves it room (`--top-notice-h`, below).
 */
export function TopNotice({ label, text, children }: { label: string; text: ReactNode; children: ReactNode }) {
  const pill = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pill.current
    if (!el) return
    const key = {}
    // Its own height and a little air under it.
    const measure = () => {
      heights.set(key, Math.ceil(el.getBoundingClientRect().height) + 12)
      writeRoom()
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    return () => {
      observer?.disconnect()
      heights.delete(key)
      writeRoom()
    }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.75rem)] z-40 flex justify-center px-4 lg:top-[calc(env(safe-area-inset-top)+5.5rem)]">
      <div
        ref={pill}
        role="status"
        aria-label={label}
        // A phone has no room for the words and three buttons on one line,
        // so there it is two short lines, as wide as its buttons and no
        // wider; from a tablet up it is one.
        className="pointer-events-auto flex w-fit max-w-full flex-col items-center gap-x-2 gap-y-0.5 rounded-[var(--radius-card)] bg-surface-container px-3 py-1.5 text-body-sm text-on-surface shadow-[var(--shadow-lifted)] ring-1 ring-black/8 sm:flex-row sm:py-1.5 sm:pl-4 sm:pr-1.5 dark:ring-white/12"
      >
        <span className="flex min-w-0 items-center gap-2 py-0.5 sm:py-1">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent-blue" aria-hidden="true" />
          <span className="min-w-0">{text}</span>
        </span>
        <span className="flex flex-wrap items-center justify-center gap-1">{children}</span>
      </div>
    </div>
  )
}

/** The notice's one filled button: the thing it is there to offer. */
export const NOTICE_PRIMARY =
  'tap shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-70'
/** Its other buttons: there, and quiet. */
export const NOTICE_QUIET =
  'tap shrink-0 rounded-full px-3 py-1.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-60'
/** A second thing worth pressing, beside the filled one. */
export const NOTICE_SECOND =
  'tap shrink-0 rounded-full px-3 py-1.5 text-body-sm font-medium text-accent-blue-soft hover:underline disabled:opacity-60'

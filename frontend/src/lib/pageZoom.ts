/**
 * Whether the page can be pinched bigger — each person's own choice, per
 * browser, off unless they turn it on (the Owner, 24 November 2026: the
 * app should feel like an app, and anyone who needs bigger text can have
 * it).
 *
 * Off is two things, because the platforms disagree. The viewport tag
 * (maximum-scale=1, user-scalable=no) is what Android keeps to. iOS Safari
 * has ignored user-scalable since iOS 10 but still sends its own gesture
 * events for a pinch, and cancelling those stops the page zooming. Pointer
 * and touch events are never touched, so the stage plan's own pinch
 * (StageCanvas), the family graph's and the map's still work either way.
 * A double tap zooms nothing in both states: the body's touch-action:
 * manipulation covers that.
 *
 * index.html ships the "off" viewport, so the first paint already matches
 * the default; main.tsx applies the stored choice before React mounts.
 */

const STORAGE_KEY = 'rim-page-zoom'

export const VIEWPORT_FIXED = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
export const VIEWPORT_ZOOMABLE = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

/** The stored choice. Storage that cannot be read means no choice: off. */
export function readPageZoom(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function writePageZoom(allowed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, allowed ? 'on' : 'off')
  } catch {
    // ignore — the choice still holds for this visit
  }
}

const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const
const cancel = (e: Event) => e.preventDefault()

/** Make the page match the choice: the viewport tag, and iOS's gestures. */
export function applyPageZoom(allowed: boolean, doc: Document = document) {
  const viewport = doc.querySelector('meta[name="viewport"]')
  viewport?.setAttribute('content', allowed ? VIEWPORT_ZOOMABLE : VIEWPORT_FIXED)
  for (const type of GESTURES) {
    // Removing first means applying "off" twice still cancels each gesture once.
    doc.removeEventListener(type, cancel)
    if (!allowed) doc.addEventListener(type, cancel, { passive: false })
  }
}

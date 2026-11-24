import { useCallback, useSyncExternalStore } from 'react'
import { applyPageZoom, readPageZoom, writePageZoom } from './pageZoom'

// One switch for the whole page, shared like the theme: the account menu
// and Settings › Appearance both show it and can never disagree.
let current = readPageZoom()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether this browser lets the page be pinched bigger, and the switch for it. */
export function usePageZoom() {
  const allowed = useSyncExternalStore(subscribe, () => current, () => false)
  const setAllowed = useCallback((next: boolean) => {
    current = next
    writePageZoom(next)
    applyPageZoom(next)
    for (const listener of listeners) listener()
  }, [])
  return { zoomAllowed: allowed, setZoomAllowed: setAllowed }
}

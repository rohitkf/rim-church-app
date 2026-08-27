import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ThemePreference,
} from './theme'

// One preference shared by every control that shows it — the switcher in
// the account menu and the toggle in the top bar are two views of the same
// setting, so they cannot be allowed to drift apart in their own useState.
let current: ThemePreference = readThemePreference()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setPreference(next: ThemePreference) {
  current = next
  writeThemePreference(next)
  applyTheme(next)
  for (const listener of listeners) listener()
}

/**
 * The app's light/dark preference, applied to <html> and remembered per
 * browser. "System" keeps following the OS after the fact, so a machine
 * that switches at sunset takes the app with it.
 */
export function useTheme() {
  const preference = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'dark' as ThemePreference,
  )

  useEffect(() => {
    applyTheme(preference)
    if (preference !== 'system') return
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const choose = useCallback((next: ThemePreference) => setPreference(next), [])

  /** Flip between light and dark, settling "system" to whatever it is now. */
  const toggle = useCallback(() => {
    setPreference(resolveTheme(current) === 'dark' ? 'light' : 'dark')
  }, [])

  return { preference, resolved: resolveTheme(preference), choose, toggle }
}

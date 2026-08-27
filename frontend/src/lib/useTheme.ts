import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from './theme'

/**
 * The app's light/dark preference, applied to <html> and remembered per
 * browser. "System" keeps following the OS after the fact, so a machine
 * that switches at sunset takes the app with it.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference())

  useEffect(() => {
    applyTheme(preference)
    if (preference !== 'system') return
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const choose = useCallback((next: ThemePreference) => {
    writeThemePreference(next)
    setPreference(next)
  }, [])

  return { preference, choose }
}

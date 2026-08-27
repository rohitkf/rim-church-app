export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'rim-theme'

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** What the preference resolves to right now. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

/**
 * The stored preference. Reading it can throw — a private window, or a
 * browser set to block site data — and a broken theme is no reason to
 * refuse to render, so anything unexpected falls back to the default.
 */
export function readThemePreference(fallback: ThemePreference = 'dark'): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // ignore — unreadable storage just means "no preference"
  }
  return fallback
}

export function writeThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // ignore — the theme still applies for this session
  }
}

/** Stamp the resolved theme on <html>, which is what the CSS keys off. */
export function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveTheme(preference)
}

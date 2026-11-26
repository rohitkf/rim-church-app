/**
 * Where the search keeps what was last chosen from it, and forgetting it.
 *
 * On its own, apart from lib/globalSearch, because signing out has to be
 * able to forget these without knowing anything else about the search:
 * what one person looked for is not the next person's to be shown on a
 * shared phone.
 */
export const RECENT_KEY = 'rim-search-recent'

export function forgetRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY)
  } catch {
    // Nothing kept, nothing to forget.
  }
}

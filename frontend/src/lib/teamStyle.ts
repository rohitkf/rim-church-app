/**
 * How a team's colour is drawn: as a dot, or as a gradient.
 *
 * A dot is the smallest possible mark — one colour, one place, easy to
 * miss. A gradient wash spreads the same colour across the whole row, so
 * a team is identifiable from the shape of the row rather than from a
 * 10px circle you have to look for. Which of those is better depends on
 * the person and the screen, so it is a preference rather than a decision
 * taken once in the design.
 */
export type TeamStylePreference = 'dot' | 'gradient'

const STORAGE_KEY = 'rim-team-style'

/**
 * The stored preference. Reading it can throw — a private window, or a
 * browser set to block site data — and every unreadable case means the
 * same thing: no preference, so use the default.
 */
export function readTeamStyle(fallback: TeamStylePreference = 'dot'): TeamStylePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dot' || stored === 'gradient') return stored
  } catch {
    // ignore — unreadable storage just means "no preference"
  }
  return fallback
}

export function writeTeamStyle(preference: TeamStylePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // ignore — the choice still holds for this session
  }
}

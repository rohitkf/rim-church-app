/**
 * Cards or a table: how an event's registrations are shown, and which
 * this device was last left on.
 *
 * The Owner asked whether a column view was better, or both (November
 * 2026). Both: they are for different things. A card says everything
 * about one registration and has room for its buttons, which is what a
 * phone and "who is this person" want. A table says one line about each
 * and lets them be put in order and read down a column, which is what
 * "who still owes, biggest first" wants, and what a wide screen has room
 * for. So it starts as the table where there is room for one and cards
 * where there is not — and once somebody has chosen, it is their choice
 * that is kept, on that device.
 */
export type RegistrationView = 'cards' | 'table'

const STORAGE_KEY = 'rim.registrations.view'
/**
 * From here up the table's columns fit without scrolling sideways. Measured,
 * not guessed: its narrowest is about 1145px and the page's margins take 80,
 * so at 1024px (where this first stood) it opened with a fifth of itself
 * out of sight. Add a column to OrderTable and measure again.
 */
const TABLE_FROM = '(min-width: 1280px)'

export function readRegistrationView(): RegistrationView {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'cards' || stored === 'table') return stored
  } catch {
    // Unreadable storage is "no choice made".
  }
  try {
    return window.matchMedia?.(TABLE_FROM).matches ? 'table' : 'cards'
  } catch {
    return 'cards'
  }
}

export function writeRegistrationView(view: RegistrationView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // The choice still holds for this visit.
  }
}

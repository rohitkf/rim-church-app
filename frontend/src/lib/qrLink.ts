/**
 * What an item's QR code says.
 *
 * A full URL rather than a bare id, so the phone camera everyone already
 * has opens the item straight in the app. The in-app scanner reads the
 * same codes, and also accepts a bare id — a code printed before this, or
 * typed in by hand, should still work.
 */

/** Where a scanned code lands. */
export const SCAN_PATH = '/inventory/scan'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function itemScanUrl(origin: string, itemId: string): string {
  return `${origin.replace(/\/+$/, '')}${SCAN_PATH}/${itemId}`
}

/**
 * The item id inside a scanned string, or null if it is not one of ours.
 *
 * Deliberately forgiving about where the code came from — a label printed
 * against a preview deployment still identifies the same item — but strict
 * about the shape, so a stray QR code on a cable box is ignored rather
 * than sending someone to a blank page.
 */
export function itemIdFromScan(scanned: string): string | null {
  const text = scanned.trim()
  if (!text) return null
  if (UUID.test(text)) return text

  const marker = `${SCAN_PATH}/`
  const at = text.indexOf(marker)
  if (at === -1) return null

  const rest = text.slice(at + marker.length)
  const id = rest.split(/[?#/]/)[0]
  return UUID.test(id) ? id : null
}

/**
 * What an item's QR code says.
 *
 * A full URL rather than a bare id, so the phone camera everyone already
 * has opens the item straight in the app. The in-app scanner reads the
 * same codes, and also accepts a bare id — a code printed before this, or
 * typed in by hand, should still work.
 */

/**
 * Where a scanned code lands — and, once a label is printed, a promise.
 *
 * Every label already stuck to a flight case says this path. Moving the
 * Inventory page, renaming it in Settings › Menu or adding a custom domain
 * changes nothing here, but changing this path or removing its route in
 * App.tsx would turn every printed label into a dead link, silently: the
 * label still scans, the phone opens a page that is not there. So it is
 * pinned by a test (qrLink.test.ts). If a page ever has to move, keep this
 * route as well and send it on.
 */
export const SCAN_PATH = '/inventory/scan'

/**
 * The address a label is printed with, whichever address it was printed from.
 *
 * It was the page's own origin, so a label printed from a preview
 * deployment, or from a laptop running the app locally, carried an
 * address that stops working when that preview goes. The project's own
 * vercel.app address is the one that lasts: it stays attached to the
 * project for as long as the project exists, custom domain or not.
 * `VITE_LABEL_ORIGIN` is there for the day the church wants another.
 */
export const LABEL_ORIGIN: string =
  (import.meta.env.VITE_LABEL_ORIGIN as string | undefined)?.trim() || 'https://rim-church-app.vercel.app'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What an item's label says: the lasting address, the pinned path, and the
 * item's id — its row's primary key, which never changes. Not its name or
 * its serial number, both of which somebody can edit after the label is on.
 */
export function itemScanUrl(itemId: string, origin: string = LABEL_ORIGIN): string {
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

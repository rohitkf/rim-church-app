import { describe, expect, it } from 'vitest'
import { LABEL_ORIGIN, SCAN_PATH, itemIdFromScan, itemScanUrl } from './qrLink'
import appSource from '../App.tsx?raw'

const ID = '3f2b1a90-1c4d-4a7e-9b31-8a2d6e5f0c11'

describe('itemScanUrl', () => {
  it('builds a link a phone camera can open', () => {
    expect(itemScanUrl(ID)).toBe(`https://rim-church-app.vercel.app/inventory/scan/${ID}`)
  })

  /*
   * A printed label outlives the page that printed it. It used to take the
   * page's own origin, so a label printed from a preview deployment or a
   * laptop carried an address that later went dead.
   */
  it('prints the lasting address, wherever the label is printed from', () => {
    expect(window.location.origin).not.toBe(LABEL_ORIGIN)
    expect(itemScanUrl(ID).startsWith(`${LABEL_ORIGIN}/`)).toBe(true)
  })

  it('names the item by its id alone, nothing anybody can edit', () => {
    // Not the name, not the serial number: both change after a label is on.
    expect(itemScanUrl(ID)).toBe(`${LABEL_ORIGIN}${SCAN_PATH}/${ID}`)
  })

  it('does not double the slash when the origin brought one', () => {
    expect(itemScanUrl(ID, 'https://example.org/')).toBe(`https://example.org/inventory/scan/${ID}`)
  })
})

/*
 * Every label already stuck to a flight case says this. Change it, or drop
 * its route, and those labels open a page that is not there — nothing
 * fails, nobody notices, until somebody scans one on a Sunday.
 */
describe('what printed labels depend on', () => {
  it('keeps the scan path where the labels say it is', () => {
    expect(SCAN_PATH).toBe('/inventory/scan')
  })

  it('keeps a route at that path', () => {
    expect(appSource).toContain(`path="${SCAN_PATH}/:itemId"`)
  })

  it('still reads a label printed before the address was fixed', () => {
    expect(itemIdFromScan(`http://localhost:5173/inventory/scan/${ID}`)).toBe(ID)
  })
})

describe('itemIdFromScan', () => {
  it('reads our own codes', () => {
    expect(itemIdFromScan(`https://rim-church-app.vercel.app/inventory/scan/${ID}`)).toBe(ID)
  })

  // A label printed against a preview deployment names the same item, so
  // where it was printed should not matter.
  it('reads a code printed against another deployment of the app', () => {
    expect(itemIdFromScan(`https://rim-git-abc.vercel.app/inventory/scan/${ID}`)).toBe(ID)
  })

  it('ignores a query string or fragment the browser tacked on', () => {
    expect(itemIdFromScan(`https://x.dev/inventory/scan/${ID}?from=camera`)).toBe(ID)
    expect(itemIdFromScan(`https://x.dev/inventory/scan/${ID}#top`)).toBe(ID)
  })

  it('accepts a bare id, so one can be typed in by hand', () => {
    expect(itemIdFromScan(`  ${ID}  `)).toBe(ID)
  })

  // The camera sees every code in front of it, including the one on the
  // cable box. Anything that is not ours is not a destination.
  it('refuses codes that are not ours', () => {
    for (const other of [
      'https://example.com/promo',
      'WIFI:S:Church;T:WPA;P:hunter2;;',
      'https://x.dev/inventory/scan/not-a-uuid',
      '',
      '   ',
    ]) {
      expect(itemIdFromScan(other)).toBeNull()
    }
  })
})
